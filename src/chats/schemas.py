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


class MessagesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    text: str
    type: str
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
            sender_id=msg.sender_id,
            sender_name=msg.sender.name if msg.sender else None,
            is_read=msg.is_read,
            created_at=msg.created_at,
        )


class MessageSchema(BaseModel):
    id: uuid.UUID | None = None
    text: str
    writer: uuid.UUID
    type: Literal["text", "image", "video", "audio"] = "text"
    date: datetime.datetime = Field(default_factory=datetime.datetime.now)
    sender_name: str | None = None


class MessageDbSchema(BaseModel):
    text: str
    type: Literal["text", "image", "video", "audio"] = "text"
    chat_id: uuid.UUID
    sender_id: uuid.UUID
    is_read: bool = Field(default=False)
