from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from src.db.database import get_async_session
from src.s3.depends import get_s3_service
from src.s3.service import S3Service
from .repo import PostsRepository
from .service import PostsService


async def get_posts_repo(session: AsyncSession = Depends(get_async_session)) -> PostsRepository:
    return PostsRepository(session)


async def get_posts_service(
    repo: PostsRepository = Depends(get_posts_repo),
    s3: S3Service = Depends(get_s3_service),
) -> PostsService:
    return PostsService(repo, s3)
