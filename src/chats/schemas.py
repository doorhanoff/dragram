import uuid
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
import datetime


# Потолки на строковые поля. Все они пишутся в Text-колонки, и без ограничения
# один пользователь может залить в базу мегабайтные строки в любом количестве.
# Шифротекст в base64 длиннее исходника примерно в 1.4 раза, так что 8000
# символов — это ~5 КБ текста сообщения.
MAX_MESSAGE_TEXT = 8000
MAX_MEDIA_URL = 500
MAX_CHAT_NAME = 100
MAX_CHAT_MEMBERS = 100
MAX_ENCRYPTED_KEY = 2000


class ChatKeyItem(BaseModel):
    user_id: uuid.UUID
    encrypted_key: str = Field(min_length=1, max_length=MAX_ENCRYPTED_KEY)


class SetChatKeys(BaseModel):
    keys: list[ChatKeyItem] = Field(min_length=1, max_length=MAX_CHAT_MEMBERS)


class CreateChat(BaseModel):
    name: str | None = Field(default=None, max_length=MAX_CHAT_NAME)
    members: list[uuid.UUID] = Field(min_length=1, max_length=MAX_CHAT_MEMBERS)


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
    # Момент последнего heartbeat — для строки «был(а) вчера в 21:40».
    # Точность до минут: секунды здесь ничего не сообщают.
    last_seen: datetime.datetime | None = None


class LastMessage(BaseModel):
    """Последнее сообщение чата — для превью в списке чатов.

    text для текстовых сообщений едет ЗАШИФРОВАННЫМ, ровно как хранится:
    сервер его прочитать не может, расшифровывает клиент своим ключом чата.
    Для медиа text — ссылка на файл, и клиент показывает «📷 Фото».
    """
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    text: str
    type: str
    sender_id: uuid.UUID
    sender_name: str | None = None
    created_at: datetime.datetime


class ChatsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str | None
    image_url: str | None
    members_ids: list[uuid.UUID]
    members: list[MemberShort]
    created_at: datetime.datetime
    unread_count: int = 0
    last_message: LastMessage | None = None


class ReplyPreview(BaseModel):
    """Цитата в ответе. Текст тоже зашифрован — расшифровывает клиент."""
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    text: str
    type: str
    sender_id: uuid.UUID
    sender_name: str | None = None

    @classmethod
    def from_orm_msg(cls, msg) -> "ReplyPreview | None":
        if msg is None:
            return None
        return cls(
            id=msg.id,
            text=msg.text,
            type=msg.type,
            sender_id=msg.sender_id,
            sender_name=msg.sender.name if msg.sender else None,
        )


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
    reply_to_id: uuid.UUID | None = None
    reply_to: ReplyPreview | None = None

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
            reply_to_id=getattr(msg, 'reply_to_id', None),
            reply_to=ReplyPreview.from_orm_msg(getattr(msg, 'reply_to', None)),
        )


class MessageDbSchema(BaseModel):
    text: str
    type: Literal["text", "image", "video", "audio"] = "text"
    thumbnail_url: str | None = None
    chat_id: uuid.UUID
    sender_id: uuid.UUID
    is_read: bool = Field(default=False)
    reply_to_id: uuid.UUID | None = None


class ForwardMessage(BaseModel):
    # Для медиа text — ссылка на файл, и она обязана вести в наше хранилище:
    # иначе в чат пересылается «картинка» с чужого адреса, и клиенты сами
    # сходят на него, слив IP и факт прочтения. Проверяет сервис.
    #
    # Для текста text — шифротекст, уже перешифрованный клиентом ключом
    # ЧАТА-ПОЛУЧАТЕЛЯ: у каждого чата ключ свой, и переложить блоб как есть
    # нельзя — там его нечем открыть. Поэтому потолок длины здесь общий,
    # как у обычного сообщения.
    text: str = Field(min_length=1, max_length=MAX_MESSAGE_TEXT)
    type: Literal["text", "image", "video", "audio"]
    thumbnail_url: str | None = Field(default=None, max_length=MAX_MEDIA_URL)


# ── websocket / pub-sub events ──────────────────────────────────────────────
# Inbound: payloads the client sends over the chat websocket.
# Outbound: payloads the service publishes to Redis and that get forwarded
# as-is to every websocket subscriber of the chat.

class WSSendMessage(BaseModel):
    event: Literal["message"] = "message"
    text: str = Field(min_length=1, max_length=MAX_MESSAGE_TEXT)
    type: Literal["text", "image", "video", "audio"] = "text"
    # Клиентский id для оптимистичного UI: сервер не хранит его, а просто
    # возвращает в MessageEvent, чтобы отправитель сопоставил эхо со своим
    # локально показанным сообщением вместо дубля.
    client_id: str | None = Field(default=None, max_length=64)
    # Ответ на сообщение. Что оно из этого же чата, проверяет сервис: иначе
    # ответом можно было бы вытащить в чужой чат цитату из своего.
    reply_to_id: uuid.UUID | None = None


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
    client_id: str | None = None
    reply_to_id: uuid.UUID | None = None
    reply_to: ReplyPreview | None = None

    @classmethod
    def from_message(cls, msg, client_id: str | None = None) -> "MessageEvent":
        return cls(
            id=msg.id,
            text=msg.text,
            type=msg.type,
            thumbnail_url=msg.thumbnail_url,
            sender_id=msg.sender_id,
            sender_name=msg.sender.name if msg.sender else None,
            is_read=msg.is_read,
            date=msg.created_at,
            client_id=client_id,
            reply_to_id=msg.reply_to_id,
            reply_to=ReplyPreview.from_orm_msg(msg.reply_to),
        )


class ReadEvent(BaseModel):
    event: Literal["read"] = "read"
    message_ids: list[uuid.UUID]
    reader_id: uuid.UUID


class DeleteEvent(BaseModel):
    event: Literal["delete"] = "delete"
    message_id: uuid.UUID
