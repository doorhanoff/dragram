import uuid
import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, func, ForeignKey, Table, Column, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.db.database import Base

# Many-to-many: лайки
post_likes = Table(
    "post_likes",
    Base.metadata,
    Column("post_id", Uuid, ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)

# Many-to-many: закладки
post_bookmarks = Table(
    "post_bookmarks",
    Base.metadata,
    Column("post_id", Uuid, ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)

if TYPE_CHECKING:
    from src.auth.models import UsersOrm


class CommentsOrm(Base):
    __tablename__ = "comments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    text: Mapped[str] = mapped_column(Text, nullable=False)
    materials: Mapped[str] = mapped_column(Text, nullable=True)

    post_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    reply_to_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("comments.id"), nullable=True)

    created_by: Mapped["UsersOrm"] = relationship(
        "UsersOrm", foreign_keys=[created_by_id], back_populates="created_comments", lazy="selectin"
    )
    reply_to: Mapped["CommentsOrm"] = relationship(
        "CommentsOrm", remote_side="CommentsOrm.id", foreign_keys=[reply_to_id], lazy="selectin"
    )

    created_at: Mapped[datetime.datetime] = mapped_column(server_default=func.now())


class PostsOrm(Base):
    __tablename__ = "posts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    materials: Mapped[str] = mapped_column(Text, nullable=True)

    created_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=True)

    created_by: Mapped["UsersOrm"] = relationship(
        "UsersOrm", foreign_keys=[created_by_id], back_populates="created_posts", lazy="selectin"
    )
    comments: Mapped[list["CommentsOrm"]] = relationship(
        "CommentsOrm", foreign_keys="CommentsOrm.post_id", lazy="selectin", cascade="all, delete-orphan"
    )
    liked_by: Mapped[list["UsersOrm"]] = relationship(
        "UsersOrm", secondary=post_likes, lazy="noload"
    )
    bookmarked_by: Mapped[list["UsersOrm"]] = relationship(
        "UsersOrm", secondary=post_bookmarks, lazy="noload"
    )

    created_at: Mapped[datetime.datetime] = mapped_column(server_default=func.now())
