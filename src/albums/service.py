import uuid
import asyncio
from fastapi import UploadFile

from .repo import AlbumsRepository
from .schemas import CreateAlbum
from .models import AlbumsOrm, AlbumMaterialsOrm
from .exceptions import AlbumNotFound, NotAlbumMember, InvalidFileType
from ..s3.service import S3Service

ALLOWED_MEDIA_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
}


class AlbumsService:
    def __init__(self, repo: AlbumsRepository, s3: S3Service):
        self.repo = repo
        self.s3 = s3

    async def create(self, data: CreateAlbum, user_id: uuid.UUID) -> AlbumsOrm:
        return await self.repo.create(data, user_id)

    async def get_user_albums(self, user_id: uuid.UUID) -> list[AlbumsOrm]:
        return await self.repo.get_user_albums(user_id)

    async def get_detail(self, album_id: uuid.UUID, user_id: uuid.UUID) -> AlbumsOrm:
        album = await self.repo.get_by_id(album_id)
        if not album:
            raise AlbumNotFound
        if not await self.repo.is_member(album_id, user_id):
            raise NotAlbumMember
        return album

    async def add_member(self, album_id: uuid.UUID, target_user_id: uuid.UUID, user_id: uuid.UUID) -> None:
        album = await self.repo.get_by_id(album_id)
        if not album:
            raise AlbumNotFound
        if not await self.repo.is_member(album_id, user_id):
            raise NotAlbumMember
        await self.repo.add_member(album_id, target_user_id)

    async def remove_member(self, album_id: uuid.UUID, target_user_id: uuid.UUID, user_id: uuid.UUID) -> None:
        album = await self.repo.get_by_id(album_id)
        if not album:
            raise AlbumNotFound
        if not await self.repo.is_member(album_id, user_id):
            raise NotAlbumMember
        await self.repo.remove_member(album_id, target_user_id)

    async def get_materials(self, album_id: uuid.UUID, user_id: uuid.UUID) -> list[AlbumMaterialsOrm]:
        album = await self.repo.get_by_id(album_id)
        if not album:
            raise AlbumNotFound
        if not await self.repo.is_member(album_id, user_id):
            raise NotAlbumMember
        return await self.repo.get_materials(album_id)

    async def upload_materials(self, album_id: uuid.UUID, files: list[UploadFile], user_id: uuid.UUID) -> list[AlbumMaterialsOrm]:
        album = await self.repo.get_by_id(album_id)
        if not album:
            raise AlbumNotFound
        if not await self.repo.is_member(album_id, user_id):
            raise NotAlbumMember

        invalid = [f.filename for f in files if f.content_type not in ALLOWED_MEDIA_TYPES]
        if invalid:
            raise InvalidFileType

        urls = await asyncio.gather(*[
            self.s3.upload_file(f.file, f.content_type) for f in files
        ])
        return await asyncio.gather(*[
            self.repo.add_material(album_id, url, user_id) for url in urls
        ])
