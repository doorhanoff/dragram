import uuid
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.database import Base

from src.chats.models import chat_members
from src.posts.models import PostsOrm, CommentsOrm

if TYPE_CHECKING:
    from src.chats.models import ChatsOrm

class UsersOrm(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    name: Mapped[str] = mapped_column(String(50), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    image_url: Mapped[str] = mapped_column(Text, nullable=True)

    is_admin:  Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    public_key:  Mapped[str] = mapped_column(Text, nullable=True)
    key_backup:  Mapped[str] = mapped_column(Text, nullable=True)

    chats: Mapped[list["ChatsOrm"]] = relationship(
        "ChatsOrm", secondary=chat_members, back_populates="members", lazy="selectin"
    )

    # FK на стороне PostsOrm и CommentsOrm — здесь только обратные ссылки
    created_posts: Mapped[list["PostsOrm"]] = relationship(
        "PostsOrm",
        back_populates="created_by",
        foreign_keys=[PostsOrm.created_by_id],
        lazy="noload",
    )
    created_comments: Mapped[list["CommentsOrm"]] = relationship(
        "CommentsOrm",
        back_populates="created_by",
        foreign_keys=[CommentsOrm.created_by_id],
        lazy="noload",
    )
