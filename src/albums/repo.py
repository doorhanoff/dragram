import uuid
from sqlalchemy import select, insert, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession
from .models import AlbumsOrm, AlbumMaterialsOrm, album_members
from .schemas import CreateAlbum


class AlbumsRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, data: CreateAlbum, user_id: uuid.UUID) -> AlbumsOrm:
        stmt = (
            insert(AlbumsOrm)
            .values(**data.model_dump(), creator_id=user_id)
            .returning(AlbumsOrm)
        )
        res = await self.session.execute(stmt)
        await self.session.commit()
        album_id = res.scalar_one().id

        await self.session.execute(
            insert(album_members).values(album_id=album_id, user_id=user_id)
        )
        await self.session.commit()

        return await self.get_by_id(album_id)

    async def get_by_id(self, album_id: uuid.UUID) -> AlbumsOrm | None:
        query = select(AlbumsOrm).where(AlbumsOrm.id == album_id)
        res = await self.session.execute(query)
        return res.unique().scalar_one_or_none()

    async def get_user_albums(self, user_id: uuid.UUID) -> list[AlbumsOrm]:
        cover_subq = (
            select(AlbumMaterialsOrm.album_id, AlbumMaterialsOrm.link)
            .distinct(AlbumMaterialsOrm.album_id)
            .order_by(AlbumMaterialsOrm.album_id, AlbumMaterialsOrm.published_at.desc())
            .subquery()
        )
        query = (
            select(AlbumsOrm, cover_subq.c.link)
            .join(album_members, album_members.c.album_id == AlbumsOrm.id)
            .outerjoin(cover_subq, cover_subq.c.album_id == AlbumsOrm.id)
            .where(album_members.c.user_id == user_id)
            .order_by(AlbumsOrm.created_at.desc())
        )
        res = await self.session.execute(query)
        albums = []
        for album, cover in res.unique().all():
            album.cover = cover
            albums.append(album)
        return albums

    async def is_member(self, album_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        query = select(album_members).where(
            album_members.c.album_id == album_id,
            album_members.c.user_id == user_id,
        )
        res = await self.session.execute(query)
        return res.first() is not None

    async def add_member(self, album_id: uuid.UUID, user_id: uuid.UUID) -> None:
        existing = await self.is_member(album_id, user_id)
        if existing:
            return
        await self.session.execute(
            insert(album_members).values(album_id=album_id, user_id=user_id)
        )
        await self.session.commit()

    async def remove_member(self, album_id: uuid.UUID, user_id: uuid.UUID) -> None:
        await self.session.execute(
            delete(album_members).where(
                album_members.c.album_id == album_id,
                album_members.c.user_id == user_id,
            )
        )
        await self.session.commit()

    async def add_material(self, album_id: uuid.UUID, link: str, user_id: uuid.UUID) -> AlbumMaterialsOrm:
        stmt = (
            insert(AlbumMaterialsOrm)
            .values(album_id=album_id, link=link, published_by_id=user_id)
            .returning(AlbumMaterialsOrm)
        )
        res = await self.session.execute(stmt)
        await self.session.commit()
        material_id = res.scalar_one().id

        result = await self.session.execute(
            select(AlbumMaterialsOrm).where(AlbumMaterialsOrm.id == material_id)
        )
        return result.scalar_one()

    async def get_materials(self, album_id: uuid.UUID) -> list[AlbumMaterialsOrm]:
        query = (
            select(AlbumMaterialsOrm)
            .where(AlbumMaterialsOrm.album_id == album_id)
            .order_by(AlbumMaterialsOrm.published_at.asc())
        )
        res = await self.session.execute(query)
        return list(res.scalars().all())
