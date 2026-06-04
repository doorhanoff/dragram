from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends, HTTPException, WebSocketException, status
from redis.asyncio import Redis
from src.db.database import get_async_session
from src.redis.depends import get_redis_client
from .repo import ChatsRepository
from .service import ChatsService
from ..auth.depends import get_current_user, ws_get_current_user
from ..auth.models import UsersOrm
from ..s3.depends import get_s3_service
from ..s3.service import S3Service
import uuid


async def get_chats_repo(session: AsyncSession = Depends(get_async_session)) -> ChatsRepository:
    return ChatsRepository(session)


async def get_chats_service(
    repo: ChatsRepository = Depends(get_chats_repo),
    s3: S3Service = Depends(get_s3_service),
    redis: Redis = Depends(get_redis_client),
) -> ChatsService:
    return ChatsService(repo, s3, redis)


async def get_chat(
    chat_id: uuid.UUID,
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):
    if any(chat_id == chat.id for chat in user.chats):
        return await service.get_by_id(chat_id)
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dont have permission")


async def ws_get_chat(
    chat_id: uuid.UUID,
    user: UsersOrm = Depends(ws_get_current_user),
    service: ChatsService = Depends(get_chats_service),
):
    if any(chat_id == chat.id for chat in user.chats):
        return await service.get_by_id(chat_id)
    raise WebSocketException(code=4003, reason="Not a member of this chat")






