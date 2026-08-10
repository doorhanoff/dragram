import uuid
from sqlalchemy import select, insert, delete, func, or_
from src.db.repository import BaseRepository
from .models import AlbumsOrm, AlbumMaterialsOrm, album_members
from .schemas import CreateAlbum


class AlbumsRepository(BaseRepository):

    async def create(self, data: CreateAlbum, user_id: uuid.UUID) -> AlbumsOrm:
        stmt = (
            insert(AlbumsOrm)
            .values(**data.model_dump(), creator_id=user_id)
            .returning(AlbumsOrm)
        )
        res = await self.session.execute(stmt)
        album_id = res.scalar_one().id

        await self.session.execute(
            insert(album_members).values(album_id=album_id, user_id=user_id)
        )

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
        # Под названием альбома человеку нужны две вещи: сколько там фотографий
        # и когда добавляли последние. Считаем их здесь, одним запросом —
        # отдельная выборка материалов на каждый альбом стоила бы дороже всего
        # экрана.
        stats_subq = (
            select(
                AlbumMaterialsOrm.album_id.label("album_id"),
                func.count().label("materials_count"),
                func.max(AlbumMaterialsOrm.published_at).label("last_added_at"),
            )
            .group_by(AlbumMaterialsOrm.album_id)
            .subquery()
        )
        query = (
            select(AlbumsOrm, cover_subq.c.link, stats_subq.c.materials_count, stats_subq.c.last_added_at)
            .join(album_members, album_members.c.album_id == AlbumsOrm.id)
            .outerjoin(cover_subq, cover_subq.c.album_id == AlbumsOrm.id)
            .outerjoin(stats_subq, stats_subq.c.album_id == AlbumsOrm.id)
            .where(album_members.c.user_id == user_id)
            .order_by(AlbumsOrm.created_at.desc())
        )
        res = await self.session.execute(query)
        albums = []
        for album, cover, count, last_added in res.unique().all():
            album.cover = cover
            album.materials_count = count or 0
            album.last_added_at = last_added
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

    async def remove_member(self, album_id: uuid.UUID, user_id: uuid.UUID) -> None:
        await self.session.execute(
            delete(album_members).where(
                album_members.c.album_id == album_id,
                album_members.c.user_id == user_id,
            )
        )

    async def add_material(self, album_id: uuid.UUID, link: str, user_id: uuid.UUID) -> AlbumMaterialsOrm:
        stmt = (
            insert(AlbumMaterialsOrm)
            .values(album_id=album_id, link=link, published_by_id=user_id)
            .returning(AlbumMaterialsOrm)
        )
        res = await self.session.execute(stmt)
        material_id = res.scalar_one().id

        result = await self.session.execute(
            select(AlbumMaterialsOrm).where(AlbumMaterialsOrm.id == material_id)
        )
        return result.scalar_one()

    async def get_material(self, material_id: uuid.UUID) -> AlbumMaterialsOrm | None:
        res = await self.session.execute(
            select(AlbumMaterialsOrm).where(AlbumMaterialsOrm.id == material_id)
        )
        return res.scalar_one_or_none()

    async def delete_material(self, material_id: uuid.UUID) -> None:
        from sqlalchemy import delete as sa_delete
        await self.session.execute(
            sa_delete(AlbumMaterialsOrm).where(AlbumMaterialsOrm.id == material_id)
        )

    async def get_materials(self, album_id: uuid.UUID) -> list[AlbumMaterialsOrm]:
        query = (
            select(AlbumMaterialsOrm)
            .where(AlbumMaterialsOrm.album_id == album_id)
            .order_by(AlbumMaterialsOrm.published_at.asc())
        )
        res = await self.session.execute(query)
        return list(res.scalars().all())
