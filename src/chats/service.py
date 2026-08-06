import json
import logging
import uuid
from typing import Literal

from fastapi import UploadFile
from pydantic import ValidationError
from redis.asyncio import Redis

from .exceptions import (
    ChatNotFound, NotChatMember, InvalidFileType, KeyTargetNotMember, TooLargeSize,
    ForeignMediaUrl, InvalidEvent, TooManyMessages, UnknownMember,
)
from .repo import ChatsRepository
from .schemas import (
    CreateChat, CreateChatDb, MessageDbSchema, ChatKeyItem, ForwardMessage,
    MessageEvent, ReadEvent, DeleteEvent, WSSendMessage,
)
from .models import ChatsOrm, MessagesOrm
from ..auth.models import UsersOrm
from ..s3.service import S3Service
from ..notifications.service import NotificationsService
from src.config import ALLOWED_MEDIA_TYPES, ALLOWED_IMAGE_TYPES
from src.core.quota import UploadQuota
from src.core.rate_limit import hit_counter


NOTIFICATION_BODY_BY_TYPE = {
    "text": "\U0001F4AC Новое сообщение",
    "image": "\U0001F4F7 Фото",
    "video": "\U0001F3A5 Видео",
    "audio": "\U0001F3B5 Голосовое сообщение",
}
DEFAULT_NOTIFICATION_BODY = NOTIFICATION_BODY_BY_TYPE["text"]

# Полезная нагрузка data-push у FCM ограничена 4 КБ. Шифротекст длинного
# сообщения туда не влезет — такое уведомление придёт с общей подписью.
MAX_PUSH_CIPHERTEXT = 2500

# Потолки на один файл. Раньше здесь стояло 3 ГБ для видео — число, которое
# ничего не ограничивало: реальным пределом был client_max_body_size в nginx,
# а диск VPS меньше нескольких таких файлов. Значения согласованы с nginx.
MAX_IMAGE_SIZE = 1024 * 1024 * 25
MAX_VIDEO_SIZE = 1024 * 1024 * 200
MAX_AUDIO_SIZE = 1024 * 1024 * 50

# Сообщений в websocket на пользователя. Каждое — это запись в БД, публикация
# в Redis и push всем офлайн-участникам, поэтому лимит на соединения
# (он считает только попытки подключиться) ничего здесь не защищал.
MAX_WS_MESSAGES = 30
WS_MESSAGE_WINDOW = 10

logger = logging.getLogger(__name__)


class ChatsService:
    def __init__(
        self,
        repo: ChatsRepository,
        s3: S3Service,
        redis: Redis,
        notifications: NotificationsService,
        redis_pubsub: Redis,
        quota: UploadQuota,
    ):
        self.repo = repo
        self.s3 = s3
        self.redis = redis
        self.notifications = notifications
        self.redis_pubsub = redis_pubsub
        self.quota = quota

    async def create(self, data: CreateChat, user: UsersOrm) -> ChatsOrm:
        members = list({user.id, *data.members})
        # Проверяем участников до вставки: несуществующий UUID иначе доходил
        # до нарушения внешнего ключа и превращался в 500.
        if not await self.repo.all_users_exist(members):
            raise UnknownMember()
        existing_chat = await self.repo.get_by_members(members)
        if existing_chat:
            return existing_chat
        db_chat_data = CreateChatDb(members=members, name=data.name)
        chat = await self.repo.create(db_chat_data)
        await self.repo.commit()
        return chat

    async def _get_chat_for_member(self, chat_id: uuid.UUID, user: UsersOrm) -> ChatsOrm:
        chat = await self.repo.get_by_id(chat_id)
        if not chat:
            raise ChatNotFound
        if user.id not in chat.members_ids:
            raise NotChatMember
        return chat

    async def upload_photo_for_chat(self, chat_id: uuid.UUID, photo: UploadFile, user: UsersOrm) -> ChatsOrm:
        await self._get_chat_for_member(chat_id, user)
        if photo.content_type not in ALLOWED_IMAGE_TYPES:
            raise InvalidFileType
        image_url = await self.s3.upload_file(photo.file, photo.content_type)
        updated = await self.repo.update_chat_image(chat_id, image_url)
        await self.repo.commit()
        return updated

    async def get_by_id(self, item_id: uuid.UUID) -> ChatsOrm | None:
        return await self.repo.get_by_id(item_id)

    async def get_all(self) -> list[ChatsOrm]:
        return await self.repo.get_all()

    async def list_chats(self, user: UsersOrm) -> list[ChatsOrm]:
        chats = user.chats
        if not chats:
            return chats

        unread = await self.repo.unread_counts([c.id for c in chats], user.id)

        # Один MGET на всех участников всех чатов вместо запроса на каждого
        members = [m for chat in chats for m in chat.members]
        online_flags = await self.redis.mget([f"online:{m.id}" for m in members])
        for member, online in zip(members, online_flags):
            member.is_active = online is not None

        for chat in chats:
            chat.unread_count = unread.get(chat.id, 0)
        return chats

    async def set_online(self, user_id: uuid.UUID) -> None:
        await self.redis.set(f"online:{user_id}", "1", ex=60)

    async def get_messages(
        self,
        chat_id: uuid.UUID,
        limit: int = 50,
        before_id: uuid.UUID | None = None,
    ) -> list[MessagesOrm]:
        return await self.repo.get_messages_paginated(chat_id, limit, before_id)

    async def set_chat_keys(self, chat_id: uuid.UUID, keys: list[ChatKeyItem], user: UsersOrm) -> None:
        chat = await self._get_chat_for_member(chat_id, user)
        member_ids = set(chat.members_ids)
        for key in keys:
            if key.user_id not in member_ids:
                raise KeyTargetNotMember
        await self.repo.set_chat_keys(chat_id, keys)
        await self.repo.commit()

    async def get_members_without_keys(self, chat_id: uuid.UUID, user: UsersOrm) -> list[uuid.UUID]:
        await self._get_chat_for_member(chat_id, user)
        return await self.repo.members_without_keys(chat_id)

    async def get_my_chat_key(self, chat_id: uuid.UUID, user: UsersOrm):
        await self._get_chat_for_member(chat_id, user)
        return await self.repo.get_my_chat_key(chat_id, user.id)

    async def _publish_message(self, chat_id: uuid.UUID, msg: MessagesOrm, client_id: str | None = None) -> MessageEvent:
        event = MessageEvent.from_message(msg, client_id=client_id)
        await self.redis.publish(f"chat:{chat_id}", event.model_dump_json())
        return event

    async def send_message(
        self,
        user: UsersOrm,
        chat: ChatsOrm,
        text: str,
        type: Literal["text", "image", "video", "audio"] = "text",
        thumbnail_url: str | None = None,
        client_id: str | None = None,
    ) -> MessageEvent:
        message_db = MessageDbSchema(
            text=text, type=type, thumbnail_url=thumbnail_url,
            sender_id=user.id, chat_id=chat.id,
        )
        msg = await self.repo.create_message(message_db)

        await self.repo.commit()

        published_message = await self._publish_message(chat.id, msg, client_id=client_id)
        await self.notify_new_message(chat, user, published_message)

        return published_message

    async def send_media_message(
        self, user: UsersOrm, file: UploadFile, chat: ChatsOrm, thumbnail: UploadFile | None = None
    ) -> MessageEvent:
        if file.content_type not in ALLOWED_MEDIA_TYPES:
            raise InvalidFileType
        # Тип и размер проверяем ДО загрузки: отвергнутый файл не должен
        # успеть попасть в хранилище.
        if file.content_type.startswith("video/"):
            msg_type, max_size = "video", MAX_VIDEO_SIZE
        elif file.content_type.startswith("audio/"):
            msg_type, max_size = "audio", MAX_AUDIO_SIZE
        else:
            msg_type, max_size = "image", MAX_IMAGE_SIZE
        if file.size and file.size > max_size:
            raise TooLargeSize()
        await self.quota.consume(user.id, file.size or 0)

        url = await self.s3.upload_file(file.file, file.content_type)

        thumbnail_url = None
        if thumbnail and msg_type == "video":
            try:
                thumbnail_url = await self.s3.upload_file(thumbnail.file, "image/jpeg")
            except Exception:
                logger.warning("Video thumbnail upload failed, sending without preview", exc_info=True)

        return await self.send_message(user, chat, text=url, type=msg_type, thumbnail_url=thumbnail_url)

    async def forward_message(self, user: UsersOrm, data: ForwardMessage, chat: ChatsOrm) -> MessageEvent:
        # Пересылается ссылка на файл, а не сам файл, поэтому она обязана вести
        # в наше хранилище. Иначе в чат пересылается «картинка» с адресом
        # злоумышленника, и клиенты участников сами её загружают.
        for url in (data.text, data.thumbnail_url):
            if url and self.s3.key_from_url(url) is None:
                raise ForeignMediaUrl()
        return await self.send_message(
            user, chat, text=data.text, type=data.type, thumbnail_url=data.thumbnail_url,
        )

    async def notify_new_message(self, chat: ChatsOrm, sender: UsersOrm, event: MessageEvent) -> None:
        recipient_ids = [m for m in chat.members_ids if m != sender.id]
        if not recipient_ids:
            return
        online_flags = await self.redis.mget([f"online:{rid}" for rid in recipient_ids])
        offline_ids = [rid for rid, online in zip(recipient_ids, online_flags) if online is None]
        if not offline_ids:
            return
        # body — запасная подпись: её покажут, если расшифровать не выйдет
        # (нет ключа чата, старая версия клиента, не-Android платформа).
        body = NOTIFICATION_BODY_BY_TYPE.get(event.type, DEFAULT_NOTIFICATION_BODY)
        # В payload едут только идентификаторы. Имя отправителя и название чата
        # раньше уходили в FCM открытым текстом: сам текст сообщения Google не
        # видел, но видел, кто кому и когда пишет. Теперь имя подставляет
        # устройство из локального справочника (NameStore.java).
        data = {
            "chat_id": str(chat.id),
            "event": "message",
            "type": event.type,
            "sender_id": str(sender.id),
            "body": body,
        }
        # Шифротекст едет как есть: расшифровать его может только устройство
        # получателя, сервер и FCM видят лишь непрозрачный blob.
        if event.type == "text" and len(event.text) <= MAX_PUSH_CIPHERTEXT:
            data["ct"] = event.text
        await self.notifications.notify_users(
            offline_ids,
            # Заголовок виден FCM, поэтому он нейтральный. Android рисует
            # уведомление сам и подставляет настоящее имя; остальным
            # платформам достанется общая подпись — расшифровать текст они
            # всё равно не могут.
            title="Dragram",
            body=body,
            data=data,
            decryptable=True,
        )

    async def mark_read(self, chat: ChatsOrm, reader_id: uuid.UUID) -> ReadEvent | None:
        if reader_id not in chat.members_ids:
            raise NotChatMember()
        msg_ids = await self.repo.mark_read(chat.id, reader_id)
        await self.repo.commit()
        if not msg_ids:
            return None
        event = ReadEvent(message_ids=msg_ids, reader_id=reader_id)
        await self.redis.publish(f"chat:{chat.id}", event.model_dump_json())
        return event

    async def delete_message(self, message_id: uuid.UUID, sender_id: uuid.UUID, chat_id: uuid.UUID) -> DeleteEvent | None:
        deleted = await self.repo.delete_message(message_id, sender_id, chat_id)
        await self.repo.commit()
        if not deleted:
            return None
        if deleted.type in ("image", "video", "audio"):
            await self.s3.delete_file(deleted.text)
        event = DeleteEvent(message_id=message_id)
        await self.redis.publish(f"chat:{chat_id}", event.model_dump_json())
        return event

    async def handle_incoming_event(self, data: dict, chat: ChatsOrm, user: UsersOrm) -> None:
        if not isinstance(data, dict):
            raise InvalidEvent("Event must be an object")
        if data.get("event") == "read":
            await self.mark_read(chat, user.id)
            return
        try:
            incoming = WSSendMessage.model_validate(data)
        except ValidationError as exc:
            # Раньше исключение всплывало в TaskGroup и рвало соединение —
            # достаточно было одного кривого JSON, чтобы чат «отвалился».
            raise InvalidEvent(exc.errors()[0].get("msg", "Malformed message")) from exc
        await self._check_message_rate(user.id)
        await self.send_message(
            user, chat, text=incoming.text, type=incoming.type,
            client_id=incoming.client_id,
        )

    async def _check_message_rate(self, user_id: uuid.UUID) -> None:
        count = await hit_counter(self.redis, f"rl:ws:{user_id}", WS_MESSAGE_WINDOW)
        if count is not None and count > MAX_WS_MESSAGES:
            logger.warning("Websocket message flood: user_id=%s", user_id)
            raise TooManyMessages()


    def get_pubsub_connection(self, chat_id: uuid.UUID) -> PubSubConnection:
        return PubSubConnection(chat_id=chat_id, redis=self.redis_pubsub)

class PubSubConnection:
    def __init__(self, chat_id: uuid.UUID, redis: Redis) -> None:
        self._pubsub = redis.pubsub()
        self._channel = f"chat:{chat_id}"

    async def __aenter__(self):
        await self._pubsub.subscribe(self._channel)
        return self

    async def __aexit__(self, exc_type, exc, tb):
        await self._pubsub.unsubscribe(self._channel)
        await self._pubsub.aclose()

    async def listen(self):
        async for raw in self._pubsub.listen():
            if raw["type"] == "message":
                yield json.loads(raw["data"])
