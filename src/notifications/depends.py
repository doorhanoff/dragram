from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from src.db.database import get_async_session
from .repo import NotificationsRepository
from .service import NotificationsService


async def get_notifications_repo(session: AsyncSession = Depends(get_async_session)) -> NotificationsRepository:
    return NotificationsRepository(session)


async def get_notifications_service(
    repo: NotificationsRepository = Depends(get_notifications_repo),
) -> NotificationsService:
    return NotificationsService(repo)
