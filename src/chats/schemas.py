import uuid
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
import datetime


class ChatKeyItem(BaseModel):
    user_id: uuid.UUID
    encrypted_key: str


class SetChatKeys(BaseModel):
    keys: list[ChatKeyItem] = Field(min_length=1)


class CreateChat(BaseModel):
    name: str | None = Field(default=None)
    members: list[uuid.UUID] = Field(min_length=1)


class CreateChatDb(BaseModel):
    name: str | None = Field(default=None)
    members: list[uuid.UUID] = Field(min_length=1)
    image_url: str | None = Field(default=None)


class MemberShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    image_url: str | None = None
    is_active: bool = False


class ChatsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str | None
    image_url: str | None
    members_ids: list[uuid.UUID]
    members: list[MemberShort]
    created_at: datetime.datetime
    unread_count: int = 0


class MessagesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    text: str
    type: str
    thumbnail_url: str | None = None
    sender_id: uuid.UUID
    sender_name: str | None = None
    is_read: bool
    created_at: datetime.datetime

    @classmethod
    def from_orm_msg(cls, msg):
        return cls(
            id=msg.id,
            text=msg.text,
            type=msg.type,
            thumbnail_url=getattr(msg, 'thumbnail_url', None),
            sender_id=msg.sender_id,
            sender_name=msg.sender.name if msg.sender else None,
            is_read=msg.is_read,
            created_at=msg.created_at,
        )


class MessageDbSchema(BaseModel):
    text: str
    type: Literal["text", "image", "video", "audio"] = "text"
    thumbnail_url: str | None = None
    chat_id: uuid.UUID
    sender_id: uuid.UUID
    is_read: bool = Field(default=False)


class ForwardMessage(BaseModel):
    text: str
    type: Literal["image", "video", "audio"]
    thumbnail_url: str | None = None


# ── websocket / pub-sub events ──────────────────────────────────────────────
# Inbound: payloads the client sends over the chat websocket.
# Outbound: payloads the service publishes to Redis and that get forwarded
# as-is to every websocket subscriber of the chat.

class WSSendMessage(BaseModel):
    event: Literal["message"] = "message"
    text: str
    type: Literal["text", "image", "video", "audio"] = "text"


class MessageEvent(BaseModel):
    event: Literal["message"] = "message"
    id: uuid.UUID
    text: str
    type: Literal["text", "image", "video", "audio"] = "text"
    thumbnail_url: str | None = None
    sender_id: uuid.UUID
    sender_name: str | None = None
    is_read: bool = False
    date: datetime.datetime

    @classmethod
    def from_message(cls, msg) -> "MessageEvent":
        return cls(
            id=msg.id,
            text=msg.text,
            type=msg.type,
            thumbnail_url=msg.thumbnail_url,
            sender_id=msg.sender_id,
            sender_name=msg.sender.name if msg.sender else None,
            is_read=msg.is_read,
            date=msg.created_at,
        )


class ReadEvent(BaseModel):
    event: Literal["read"] = "read"
    message_ids: list[uuid.UUID]
    reader_id: uuid.UUID


class DeleteEvent(BaseModel):
    event: Literal["delete"] = "delete"
    message_id: uuid.UUID
