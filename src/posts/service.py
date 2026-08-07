import asyncio
import uuid

from fastapi import UploadFile

from .repo import PostsRepository
from .schemas import CreatePost, CreateComment
from .models import PostsOrm
from .exceptions import PostNotFound, NotPostOwner, InvalidFileType
from ..s3.exceptions import FileTooLarge, ProblemWithUploadingFiles
from ..s3.service import S3Service
from src.config import ALLOWED_MEDIA_TYPES, MAX_FILE_SIZE
from src.core.quota import UploadQuota


class PostsService:
    def __init__(self, repo: PostsRepository, s3: S3Service, quota: UploadQuota):
        self.repo = repo
        self.s3 = s3
        self.quota = quota

    async def create(self, data: CreatePost, user_id: uuid.UUID) -> PostsOrm:
        post = await self.repo.create(data, user_id)
        await self.repo.commit()
        return post

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
        liked = await self.repo.toggle_like(post_id, user_id)
        await self.repo.commit()
        return liked

    async def toggle_bookmark(self, post_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        post = await self.repo.get_by_id(post_id)
        if not post:
            raise PostNotFound
        bookmarked = await self.repo.toggle_bookmark(post_id, user_id)
        await self.repo.commit()
        return bookmarked

    async def add_comment(self, data: CreateComment, post_id: uuid.UUID, user_id: uuid.UUID):
        post = await self.repo.get_by_id(post_id)
        if not post:
            raise PostNotFound
        comment = await self.repo.create_comment(data, post_id, user_id)
        await self.repo.commit()
        return comment

    async def get_comments(self, post_id: uuid.UUID, limit: int, offset: int):
        post = await self.repo.get_by_id(post_id)
        if not post:
            raise PostNotFound
        return await self.repo.get_comments(post_id, limit, offset)

    async def delete_post(self, post_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """Удаляет свой пост вместе с файлами. Возвращает False, если поста
        нет или он чужой — роутер превращает это в 404."""
        urls = await self.repo.delete_post(post_id, user_id)
        if urls is None:
            return False
        await self.repo.commit()
        # Файлы убираем после коммита и best-effort: сбой в хранилище не
        # должен отменять уже удалённый пост, но и молча копить мусор нельзя —
        # delete_file пишет о таком в лог.
        for url in urls:
            await self.s3.delete_file(url)
        return True

    async def delete_comment(self, comment_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        deleted = await self.repo.delete_comment(comment_id, user_id)
        await self.repo.commit()
        return deleted

    async def upload_media(self, post_id: uuid.UUID, files: list[UploadFile], user_id: uuid.UUID) -> PostsOrm:
        post = await self.repo.get_by_id(post_id)
        if not post:
            raise PostNotFound
        if post.created_by_id != user_id:
            raise NotPostOwner

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
            # Не оставляем в S3 файлы, на которые не будет записей в БД
            for url in urls:
                await self.s3.delete_file(url)
            raise ProblemWithUploadingFiles()

        updated = await self.repo.add_media(post_id, urls)
        await self.repo.commit()
        return updated
