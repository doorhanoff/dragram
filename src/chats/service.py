import json
import uuid
from typing import Literal

from fastapi import UploadFile
from redis.asyncio import Redis

from .exceptions import ChatNotFound, NotChatMember, InvalidFileType, KeyTargetNotMember
from .repo import ChatsRepository
from .schemas import (
    CreateChat, CreateChatDb, MessageDbSchema, ChatKeyItem, ForwardMessage,
    MessageEvent, ReadEvent, DeleteEvent, WSSendMessage,
)
from .models import ChatsOrm, MessagesOrm
from ..auth.models import UsersOrm
from ..s3.service import S3Service
from ..notifications.service import NotificationsService

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

ALLOWED_MEDIA_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
    "audio/mpeg", "audio/ogg", "audio/webm", "audio/mp4", "audio/wav",
}

NOTIFICATION_BODY_BY_TYPE = {
    "image": "\U0001F4F7 Фото",
    "video": "\U0001F3A5 Видео",
    "audio": "\U0001F3B5 Голосовое сообщение",
}


class ChatsService:
    def __init__(
        self,
        repo: ChatsRepository,
        s3: S3Service,
        redis: Redis,
        notifications: NotificationsService,
        redis_pubsub: Redis,
    ):
        self.repo = repo
        self.s3 = s3
        self.redis = redis
        self.notifications = notifications
        self.redis_pubsub = redis_pubsub

    async def create(self, data: CreateChat, user: UsersOrm) -> ChatsOrm:
        members = list({user.id, *data.members})
        existing_chat = await self.repo.get_by_members(members)
        if existing_chat:
            return existing_chat
        db_chat_data = CreateChatDb(members=members, name=data.name)
        chat = await self.repo.create(db_chat_data)
        await self.repo.commit()
        return chat

    async def upload_photo_for_chat(self, chat_id: uuid.UUID, photo: UploadFile, user: UsersOrm) -> ChatsOrm:
        chat = await self.repo.get_by_id(chat_id)
        if not chat:
            raise ChatNotFound
        if user.id not in chat.members_ids:
            raise NotChatMember
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
        for chat in chats:
            for member in chat.members:
                is_online = await self.redis.exists(f"online:{member.id}")
                member.is_active = bool(is_online)
            chat.unread_count = sum(
                1 for m in chat.messages if not m.is_read and m.sender_id != user.id
            )
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
        chat = await self.repo.get_by_id(chat_id)
        if not chat:
            raise ChatNotFound
        if user.id not in chat.members_ids:
            raise NotChatMember
        member_ids = set(chat.members_ids)
        for key in keys:
            if key.user_id not in member_ids:
                raise KeyTargetNotMember
        await self.repo.set_chat_keys(chat_id, keys)
        await self.repo.commit()

    async def get_my_chat_key(self, chat_id: uuid.UUID, user: UsersOrm):
        chat = await self.repo.get_by_id(chat_id)
        if not chat:
            raise ChatNotFound
        if user.id not in chat.members_ids:
            raise NotChatMember
        return await self.repo.get_my_chat_key(chat_id, user.id)

    async def _publish_message(self, chat_id: uuid.UUID, msg: MessagesOrm) -> MessageEvent:
        event = MessageEvent.from_message(msg)
        await self.redis.publish(f"chat:{chat_id}", event.model_dump_json())
        return event

    async def send_message(
        self,
        user: UsersOrm,
        chat: ChatsOrm,
        text: str,
        type: Literal["text", "image", "video", "audio"] = "text",
        thumbnail_url: str | None = None,
    ) -> MessageEvent:
        message_db = MessageDbSchema(
            text=text, type=type, thumbnail_url=thumbnail_url,
            sender_id=user.id, chat_id=chat.id,
        )
        msg = await self.repo.create_message(message_db)

        await self.repo.commit()

        published_message = await self._publish_message(chat.id, msg)
        await self.notify_new_message(chat, user, published_message)

        await self.repo.commit()
        return published_message

    async def send_media_message(
        self, user: UsersOrm, file: UploadFile, chat: ChatsOrm, thumbnail: UploadFile | None = None
    ) -> MessageEvent:
        if file.content_type not in ALLOWED_MEDIA_TYPES:
            raise InvalidFileType
        url = await self.s3.upload_file(file.file, file.content_type)
        if file.content_type.startswith("video/"):
            msg_type = "video"
        elif file.content_type.startswith("audio/"):
            msg_type = "audio"
        else:
            msg_type = "image"

        thumbnail_url = None
        if thumbnail and msg_type == "video":
            try:
                thumbnail_url = await self.s3.upload_file(thumbnail.file, "image/jpeg")
            except Exception:
                pass

        return await self.send_message(user, chat, text=url, type=msg_type, thumbnail_url=thumbnail_url)

    async def forward_message(self, user: UsersOrm, data: ForwardMessage, chat: ChatsOrm) -> MessageEvent:
        return await self.send_message(
            user, chat, text=data.text, type=data.type, thumbnail_url=data.thumbnail_url,
        )

    async def notify_new_message(self, chat: ChatsOrm, sender: UsersOrm, event: MessageEvent) -> None:
        recipient_ids = [m for m in chat.members_ids if m != sender.id]
        offline_ids = [rid for rid in recipient_ids if not await self.redis.exists(f"online:{rid}")]
        if not offline_ids:
            return
        body = NOTIFICATION_BODY_BY_TYPE.get(event.type, event.text[:100])
        await self.notifications.notify_users(
            offline_ids,
            title=sender.name,
            body=body,
            data={"chat_id": str(chat.id), "event": "message"},
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
        deleted = await self.repo.delete_message(message_id, sender_id)
        await self.repo.commit()
        if not deleted:
            return None
        if deleted.type in ("image", "video", "audio"):
            await self.s3.delete_file(deleted.text)
        event = DeleteEvent(message_id=message_id)
        await self.redis.publish(f"chat:{chat_id}", event.model_dump_json())
        return event

    async def handle_incoming_event(self, data: dict, chat: ChatsOrm, user: UsersOrm) -> MessageEvent:
        if data.get("event") == "read":
            await self.mark_read(chat, user.id)
        else:
            incoming = WSSendMessage.model_validate(data)
            await self.send_message(user, chat, text=incoming.text, type=incoming.type)


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
