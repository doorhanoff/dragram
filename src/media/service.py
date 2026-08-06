import logging
import uuid

from redis.asyncio import Redis

from src.core.tickets import MEDIA_TICKET_PREFIX, MEDIA_TICKET_TTL, issue_ticket, redeem_ticket
from src.s3.service import S3Service

logger = logging.getLogger(__name__)


class MediaService:
    """Доступ к загруженным файлам.

    Бакет в Object Storage закрыт: прямых публичных ссылок на загрузки нет.
    Сервис выдаёт временные presigned-ссылки и тикеты, которыми клиент
    подписывает `<img src>` — заголовок Authorization там задать нельзя.
    """

    def __init__(self, s3: S3Service, redis: Redis):
        self.s3 = s3
        self.redis = redis

    async def issue_ticket(self, user_id: uuid.UUID) -> tuple[str, int]:
        ticket = await issue_ticket(self.redis, MEDIA_TICKET_PREFIX, user_id, MEDIA_TICKET_TTL)
        return ticket, MEDIA_TICKET_TTL

    async def user_by_ticket(self, ticket: str | None) -> uuid.UUID | None:
        # one_time=False: одним тикетом открывается вся лента, гасить его
        # на первой же картинке нельзя.
        return await redeem_ticket(self.redis, MEDIA_TICKET_PREFIX, ticket, one_time=False)

    def is_servable(self, key: str) -> bool:
        return self.s3.is_public_key(key)

    async def link_for(self, key: str) -> str:
        return await self.s3.generate_presigned_url(key)
