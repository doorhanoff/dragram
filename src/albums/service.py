import uuid
import asyncio
from fastapi import UploadFile

from .repo import AlbumsRepository
from .schemas import CreateAlbum
from .models import AlbumsOrm, AlbumMaterialsOrm
from .exceptions import AlbumNotFound, CannotRemoveOwner, NotAlbumMember, NotAlbumOwner, InvalidFileType
from ..s3.exceptions import FileTooLarge, ProblemWithUploadingFiles
from ..s3.service import S3Service
from src.config import ALLOWED_MEDIA_TYPES, MAX_FILE_SIZE
from src.core.quota import UploadQuota


class AlbumsService:
    def __init__(self, repo: AlbumsRepository, s3: S3Service, quota: UploadQuota):
        self.repo = repo
        self.s3 = s3
        self.quota = quota

    async def _get_album_for_member(self, album_id: uuid.UUID, user_id: uuid.UUID) -> AlbumsOrm:
        album = await self.repo.get_by_id(album_id)
        if not album:
            raise AlbumNotFound
        if not await self.repo.is_member(album_id, user_id):
            raise NotAlbumMember
        return album

    async def create(self, data: CreateAlbum, user_id: uuid.UUID) -> AlbumsOrm:
        album = await self.repo.create(data, user_id)
        await self.repo.commit()
        return album

    async def get_user_albums(self, user_id: uuid.UUID) -> list[AlbumsOrm]:
        return await self.repo.get_user_albums(user_id)

    async def get_detail(self, album_id: uuid.UUID, user_id: uuid.UUID) -> AlbumsOrm:
        return await self._get_album_for_member(album_id, user_id)

    async def _get_album_for_owner(self, album_id: uuid.UUID, user_id: uuid.UUID) -> AlbumsOrm:
        album = await self._get_album_for_member(album_id, user_id)
        if album.creator_id != user_id:
            raise NotAlbumOwner
        return album

    async def add_member(self, album_id: uuid.UUID, target_user_id: uuid.UUID, user_id: uuid.UUID) -> None:
        # Приглашать может только создатель: раньше любой приглашённый мог
        # звать кого угодно дальше.
        await self._get_album_for_owner(album_id, user_id)
        await self.repo.add_member(album_id, target_user_id)
        await self.repo.commit()

    async def remove_member(self, album_id: uuid.UUID, target_user_id: uuid.UUID, user_id: uuid.UUID) -> None:
        """Удалять участников может создатель; любой другой вправе только выйти
        сам. Раньше проверялось лишь членство — то есть приглашённый мог выгнать
        всех, включая создателя, и забрать альбом себе."""
        album = await self._get_album_for_member(album_id, user_id)
        if target_user_id == album.creator_id:
            # Альбом без создателя остался бы без владельца навсегда.
            raise CannotRemoveOwner
        if target_user_id != user_id and album.creator_id != user_id:
            raise NotAlbumOwner
        await self.repo.remove_member(album_id, target_user_id)
        await self.repo.commit()

    async def get_materials(self, album_id: uuid.UUID, user_id: uuid.UUID) -> list[AlbumMaterialsOrm]:
        await self._get_album_for_member(album_id, user_id)
        return await self.repo.get_materials(album_id)

    async def upload_materials(self, album_id: uuid.UUID, files: list[UploadFile], user_id: uuid.UUID) -> list[AlbumMaterialsOrm]:
        await self._get_album_for_member(album_id, user_id)

        invalid = [f.filename for f in files if f.content_type not in ALLOWED_MEDIA_TYPES]
        if invalid:
            raise InvalidFileType
        if any(f.size and f.size > MAX_FILE_SIZE for f in files):
            raise FileTooLarge()
        await self.quota.consume_all(user_id, [f.size for f in files])

        results = await asyncio.gather(
            *[self.s3.upload_file(f.file, f.content_type) for f in files],
            return_exceptions=True,
        )
        failed = [r for r in results if isinstance(r, BaseException)]
        urls = [r for r in results if not isinstance(r, BaseException)]
        if failed:
            # Пачка загружается атомарно: не оставляем в S3 файлы,
            # на которые не будет записей в БД.
            for url in urls:
                await self.s3.delete_file(url)
            raise ProblemWithUploadingFiles()

        # Загрузка в S3 идёт параллельно, а запись в БД — последовательно:
        # AsyncSession не рассчитана на одновременное использование из
        # нескольких корутин, gather по репозиторию ломает её состояние.
        materials = [
            await self.repo.add_material(album_id, url, user_id) for url in urls
        ]
        await self.repo.commit()
        return materials
