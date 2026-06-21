import uuid
import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, func, ForeignKey, Table, Column, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.db.database import Base

if TYPE_CHECKING:
    from src.auth.models import UsersOrm


chat_members = Table(
    "chat_members",
    Base.metadata,
    Column("chat_id", Uuid, ForeignKey("chats.id", ondelete="CASCADE", name="fk_chat_members_chat_id"), primary_key=True),
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE", name="fk_chat_members_user_id"), primary_key=True),
)


class MessagesOrm(Base):
    __tablename__ = 'messages'

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    text: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(10), default="text", server_default="text")
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    chat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('chats.id'))
    sender_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'))
    is_read: Mapped[bool] = mapped_column(default=False)

    created_at: Mapped[datetime.datetime] = mapped_column(server_default=func.now())

    chat:   Mapped["ChatsOrm"] = relationship("ChatsOrm", back_populates="messages")
    sender: Mapped["UsersOrm"] = relationship("UsersOrm", foreign_keys=[sender_id], lazy="selectin")


class ChatsOrm(Base):
    __tablename__ = "chats"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    name: Mapped[str] = mapped_column(Text, nullable=True)
    image_url: Mapped[str] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime.datetime] = mapped_column(server_default=func.now())

    messages: Mapped[list["MessagesOrm"]] = relationship(
        "MessagesOrm", foreign_keys="MessagesOrm.chat_id", back_populates="chat", lazy="selectin"
    )

    members: Mapped[list["UsersOrm"]] = relationship(
        "UsersOrm", secondary=chat_members, back_populates="chats", lazy="selectin"
    )

    @property
    def members_ids(self) -> list[uuid.UUID]:
        return [m.id for m in self.members]

class ChatKeysOrm(Base):
    __tablename__ = "chat_keys"

    chat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('chats.id'), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey('users.id'), primary_key=True)
    encrypted_key: Mapped[str] = mapped_column(Text, nullable=False)
