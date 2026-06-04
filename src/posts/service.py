import uuid

from fastapi import UploadFile

from .repo import PostsRepository
from .schemas import CreatePost, CreateComment
from .models import PostsOrm
from .exceptions import PostNotFound, NotPostOwner, InvalidFileType
from ..s3.service import S3Service

ALLOWED_MEDIA_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
}


class PostsService:
    def __init__(self, repo: PostsRepository, s3: S3Service):
        self.repo = repo
        self.s3 = s3

    async def create(self, data: CreatePost, user_id: uuid.UUID) -> PostsOrm:
        return await self.repo.create(data, user_id)

    async def get_by_id(self, item_id: uuid.UUID) -> PostsOrm | None:
        return await self.repo.get_by_id(item_id)

    async def get_all(self) -> list[PostsOrm]:
        return await self.repo.get_all()

    async def get_detail(self, post_id: uuid.UUID) -> PostsOrm:
        post = await self.repo.get_by_id_with_author(post_id)
        if not post:
            raise PostNotFound
        return post

    async def search(
        self, text: str | None, limit: int, offset: int,
        filter_: str = "all", user_id: uuid.UUID | None = None,
    ) -> list[dict]:
        return await self.repo.search(text, limit, offset, filter_, user_id)

    async def toggle_like(self, post_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        post = await self.repo.get_by_id(post_id)
        if not post:
            raise PostNotFound
        return await self.repo.toggle_like(post_id, user_id)

    async def toggle_bookmark(self, post_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        post = await self.repo.get_by_id(post_id)
        if not post:
            raise PostNotFound
        return await self.repo.toggle_bookmark(post_id, user_id)

    async def add_comment(self, data: CreateComment, post_id: uuid.UUID, user_id: uuid.UUID):
        post = await self.repo.get_by_id(post_id)
        if not post:
            raise PostNotFound
        return await self.repo.create_comment(data, post_id, user_id)

    async def get_comments(self, post_id: uuid.UUID, limit: int, offset: int):
        post = await self.repo.get_by_id(post_id)
        if not post:
            raise PostNotFound
        return await self.repo.get_comments(post_id, limit, offset)

    async def delete_comment(self, comment_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        return await self.repo.delete_comment(comment_id, user_id)

    async def upload_media(self, post_id: uuid.UUID, files: list[UploadFile], user_id: uuid.UUID) -> PostsOrm:
        post = await self.repo.get_by_id(post_id)
        if not post:
            raise PostNotFound
        if post.created_by_id != user_id:
            raise NotPostOwner

        invalid = [f.filename for f in files if f.content_type not in ALLOWED_MEDIA_TYPES]
        if invalid:
            raise InvalidFileType

        import asyncio
        urls = await asyncio.gather(*[
            self.s3.upload_file(f.file, f.content_type) for f in files
        ])
        return await self.repo.add_media(post_id, list(urls))
