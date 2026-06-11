import uuid
import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, func, ForeignKey, Table, Column, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.db.database import Base

if TYPE_CHECKING:
    from src.auth.models import UsersOrm


album_members = Table(
    "album_members",
    Base.metadata,
    Column("album_id", Uuid, ForeignKey("albums.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)


class AlbumsOrm(Base):
    __tablename__ = "albums"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    name: Mapped[str] = mapped_column(String(50), nullable=False)
    creator_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(server_default=func.now())

    creator: Mapped["UsersOrm"] = relationship("UsersOrm", foreign_keys=[creator_id], lazy="selectin")
    members: Mapped[list["UsersOrm"]] = relationship("UsersOrm", secondary=album_members, lazy="selectin")
    materials: Mapped[list["AlbumMaterialsOrm"]] = relationship(
        "AlbumMaterialsOrm", back_populates="album", cascade="all, delete-orphan", lazy="noload"
    )


class AlbumMaterialsOrm(Base):
    __tablename__ = "album_materials"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    link: Mapped[str] = mapped_column(Text, nullable=False)
    album_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("albums.id", ondelete="CASCADE"), nullable=False)
    published_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    published_by: Mapped["UsersOrm"] = relationship("UsersOrm", lazy="selectin")
    published_at: Mapped[datetime.datetime] = mapped_column(server_default=func.now())

    album: Mapped["AlbumsOrm"] = relationship("AlbumsOrm", back_populates="materials")
