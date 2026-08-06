"""Суточная квота на объём загрузок.

Потолка на один файл мало: диск VPS забивается десятком допустимых загрузок
подряд, а за объём в Object Storage ещё и платят помесячно. Счётчик общий для
всех каналов загрузки — чат, альбомы, посты, — иначе лимит обходится
переключением вкладки.
"""
import datetime
import logging
import uuid

from redis.asyncio import Redis

from src.config import settings
from src.core.exceptions import QuotaExceeded
from src.core.rate_limit import add_to_counter

logger = logging.getLogger(__name__)


class UploadQuota:
    def __init__(self, redis: Redis):
        self.redis = redis

    @staticmethod
    def _key(user_id: uuid.UUID) -> str:
        day = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
        return f"quota:{user_id}:{day}"

    async def consume(self, user_id: uuid.UUID, size: int) -> None:
        """Списывает объём и бросает QuotaExceeded, если лимит исчерпан.

        Считаем до загрузки: узнать размер после — значит уже принять файл на
        диск и заплатить за трафик. Недоступный Redis лимит не включает —
        квота защищает от постепенного исчерпания места, а не от разовой
        атаки, и ронять из-за неё отправку фотографий не стоит.
        """
        total = await add_to_counter(self.redis, self._key(user_id), max(size, 1), 86_400)
        if total is not None and total > settings.UPLOAD_DAILY_QUOTA:
            logger.warning("Upload quota exceeded: user_id=%s, total=%s bytes", user_id, total)
            raise QuotaExceeded()

    async def consume_all(self, user_id: uuid.UUID, sizes: list[int | None]) -> None:
        await self.consume(user_id, sum(s or 0 for s in sizes))
