from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends, WebSocketException
from redis.asyncio import Redis
from src.core.depends import get_upload_quota
from src.core.quota import UploadQuota
from src.db.database import async_session, get_async_session
from src.redis.depends import get_redis_client, get_redis_pubsub_client
from .exceptions import NotChatMember
from .repo import ChatsRepository
from .service import ChatsService, PubSubConnection
from ..auth.depends import get_current_user, ws_get_current_user
from ..auth.models import UsersOrm
from ..s3.depends import get_s3_service
from ..s3.service import S3Service
from ..notifications.depends import get_notifications_service
from ..notifications.repo import NotificationsRepository
from ..notifications.service import NotificationsService
import uuid


async def get_chats_repo(session: AsyncSession = Depends(get_async_session)) -> ChatsRepository:
    return ChatsRepository(session)

async def get_chats_service(
    repo: ChatsRepository = Depends(get_chats_repo),
    s3: S3Service = Depends(get_s3_service),
    redis: Redis = Depends(get_redis_client),
    redis_pubsub: Redis = Depends(get_redis_pubsub_client),
    notifications: NotificationsService = Depends(get_notifications_service),
    quota: UploadQuota = Depends(get_upload_quota),
) -> ChatsService:
    return ChatsService(repo, s3, redis, notifications, redis_pubsub, quota)


class ChatsServiceFactory:
    """Сервис чатов для websocket-соединения.

    Обычный Depends(get_chats_service) тянет за собой сессию БД, а зависимости
    с yield в websocket-эндпоинте закрываются только вместе с соединением.
    То есть каждый открытый чат держал бы коннект из пула, ничего им не делая,
    и на N одновременных чатов пул кончался: "QueuePool limit of size ...
    reached, connection timed out".

    Фабрика вместо этого создаёт сервис на одну операцию: сессия открывается
    при получении события и закрывается сразу после его обработки. Redis
    здесь ни при чём — pub/sub-подписка живёт всё соединение и пул БД не
    трогает.
    """

    def __init__(self, s3: S3Service, redis: Redis, redis_pubsub: Redis, quota: UploadQuota):
        self._s3 = s3
        self._redis = redis
        self._redis_pubsub = redis_pubsub
        self._quota = quota

    @asynccontextmanager
    async def __call__(self) -> AsyncIterator[ChatsService]:
        async with async_session() as session:
            yield ChatsService(
                ChatsRepository(session),
                self._s3,
                self._redis,
                NotificationsService(NotificationsRepository(session)),
                self._redis_pubsub,
                self._quota,
            )

    def pubsub(self, chat_id: uuid.UUID) -> PubSubConnection:
        return PubSubConnection(chat_id=chat_id, redis=self._redis_pubsub)


async def get_chats_service_factory(
    s3: S3Service = Depends(get_s3_service),
    redis: Redis = Depends(get_redis_client),
    redis_pubsub: Redis = Depends(get_redis_pubsub_client),
    quota: UploadQuota = Depends(get_upload_quota),
) -> ChatsServiceFactory:
    return ChatsServiceFactory(s3, redis, redis_pubsub, quota)


async def get_chat(
    chat_id: uuid.UUID,
    user: UsersOrm = Depends(get_current_user),
):
    # Чаты пользователя уже загружены вместе с участниками в get_current_user —
    # повторный поход в БД за тем же чатом не нужен.
    for chat in user.chats:
        if chat.id == chat_id:
            return chat
    raise NotChatMember()


async def ws_get_chat(
    chat_id: uuid.UUID,
    user: UsersOrm = Depends(ws_get_current_user),
):
    for chat in user.chats:
        if chat.id == chat_id:
            return chat
    raise WebSocketException(code=4003, reason="Not a member of this chat")






