import uuid

from fastapi import UploadFile
from redis.asyncio import Redis

from .exceptions import ChatNotFound, NotChatMember, InvalidFileType, KeyTargetNotMember
from .repo import ChatsRepository
from .schemas import CreateChat, CreateChatDb, MessageSchema, MessageDbSchema, ChatKeyItem
from .models import ChatsOrm
from ..auth.models import UsersOrm
from ..s3.service import S3Service

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

ALLOWED_MEDIA_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
    "audio/mpeg", "audio/ogg", "audio/webm", "audio/mp4", "audio/wav",
}


class ChatsService:
    def __init__(self, repo: ChatsRepository, s3: S3Service, redis: Redis):
        self.repo = repo
        self.s3 = s3
        self.redis = redis

    async def create(self, data: CreateChat, user: UsersOrm) -> ChatsOrm:
        members = list({user.id, *data.members})
        existing_chat = await self.repo.get_by_members(members)
        if existing_chat:
            return existing_chat
        db_chat_data = CreateChatDb(members=members, name=data.name)
        return await self.repo.create(db_chat_data)

    async def upload_photo_for_chat(self, chat_id: uuid.UUID, photo: UploadFile, user: UsersOrm) -> ChatsOrm:
        chat = await self.repo.get_by_id(chat_id)
        if not chat:
            raise ChatNotFound
        if user.id not in chat.members_ids:
            raise NotChatMember
        if photo.content_type not in ALLOWED_IMAGE_TYPES:
            raise InvalidFileType
        image_url = await self.s3.upload_file(photo.file, photo.content_type)
        return await self.repo.update_chat_image(chat_id, image_url)

    async def get_by_id(self, item_id: uuid.UUID) -> ChatsOrm | None:
        return await self.repo.get_by_id(item_id)

    async def get_all(self) -> list[ChatsOrm]:
        return await self.repo.get_all()

    async def set_chat_keys(self, chat_id: uuid.UUID, keys: list[ChatKeyItem], user: UsersOrm) -> None:
        chat = await self.repo.get_by_id(chat_id)
        if not chat:
            raise ChatNotFound
        if user.id not in chat.members_ids:
            raise NotChatMember
        # проверяем что каждый user_id в ключах — реальный участник чата
        member_ids = set(chat.members_ids)
        for key in keys:
            if key.user_id not in member_ids:
                raise KeyTargetNotMember
        await self.repo.set_chat_keys(chat_id, keys)

    async def get_my_chat_key(self, chat_id: uuid.UUID, user: UsersOrm):
        chat = await self.repo.get_by_id(chat_id)
        if not chat:
            raise ChatNotFound
        if user.id not in chat.members_ids:
            raise NotChatMember
        return await self.repo.get_my_chat_key(chat_id, user.id)

    async def receive_messages_loop(self, chat_id: uuid.UUID):
        pubsub = self.redis.pubsub()
        channel = f"chat:{chat_id}"
        await pubsub.subscribe(channel)

        try:
            async for raw in pubsub.listen():
                if raw["type"] == "message":
                    yield raw["data"]
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    async def send_message(self, user: UsersOrm, text: str, chat: ChatsOrm):
        channel = f"chat:{chat.id}"
        message = MessageSchema(text=text, writer=user.id, type="text")
        message_db = MessageDbSchema(text=message.text, sender_id=user.id, chat_id=chat.id)
        await self.repo.create_message(message_db)
        await self.redis.publish(channel, message.model_dump_json())

    async def mark_read(self, chat_id: uuid.UUID, reader_id: uuid.UUID) -> list[uuid.UUID]:
        return await self.repo.mark_read(chat_id, reader_id)

    async def delete_message(self, message_id: uuid.UUID, sender_id: uuid.UUID, chat_id: uuid.UUID) -> bool:
        deleted = await self.repo.delete_message(message_id, sender_id)
        if deleted and deleted.type in ("image", "video", "audio"):
            await self.s3.delete_file(deleted.text)
        return deleted is not None

    async def send_media_message(self, user: UsersOrm, file: UploadFile, chat: ChatsOrm):
        if file.content_type not in ALLOWED_MEDIA_TYPES:
            raise InvalidFileType
        url = await self.s3.upload_file(file.file, file.content_type)
        channel = f"chat:{chat.id}"
        if file.content_type.startswith("video/"):   msg_type = "video"
        elif file.content_type.startswith("audio/"): msg_type = "audio"
        else:                                         msg_type = "image"
        message = MessageSchema(text=url, writer=user.id, type=msg_type)
        message_db = MessageDbSchema(text=url, type=msg_type, sender_id=user.id, chat_id=chat.id)
        await self.repo.create_message(message_db)
        await self.redis.publish(channel, message.model_dump_json())
        return url
