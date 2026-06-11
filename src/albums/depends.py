from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from src.db.database import get_async_session
from src.s3.depends import get_s3_service
from src.s3.service import S3Service
from .repo import AlbumsRepository
from .service import AlbumsService


async def get_albums_repo(session: AsyncSession = Depends(get_async_session)) -> AlbumsRepository:
    return AlbumsRepository(session)


async def get_albums_service(
    repo: AlbumsRepository = Depends(get_albums_repo),
    s3: S3Service = Depends(get_s3_service),
) -> AlbumsService:
    return AlbumsService(repo, s3)
