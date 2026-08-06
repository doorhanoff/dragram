"""Короткоживущие тикеты в Redis.

Нужны там, где токен в заголовке передать нельзя, а в URL его класть опасно:
браузерный WebSocket не умеет задавать `Authorization`, а `<img src>` — тем
более. Тикет — случайная строка без подписи и без полезной нагрузки: даже
попав в access-лог nginx, она либо уже погашена, либо протухнет сама.
"""
import logging
import secrets
import uuid

from redis.asyncio import Redis

logger = logging.getLogger(__name__)

WS_TICKET_PREFIX = "ws_ticket"
WS_TICKET_TTL = 30

MEDIA_TICKET_PREFIX = "media_ticket"
MEDIA_TICKET_TTL = 3600


async def issue_ticket(redis: Redis, prefix: str, user_id: uuid.UUID, ttl: int) -> str:
    ticket = secrets.token_urlsafe(32)
    await redis.set(f"{prefix}:{ticket}", str(user_id), ex=ttl)
    return ticket


async def redeem_ticket(
    redis: Redis, prefix: str, ticket: str | None, *, one_time: bool
) -> uuid.UUID | None:
    """Возвращает id владельца тикета или None. one_time=True гасит тикет сразу:
    перехваченный по дороге он уже бесполезен."""
    if not ticket:
        return None
    key = f"{prefix}:{ticket}"
    try:
        raw = await redis.getdel(key) if one_time else await redis.get(key)
    except Exception as exc:
        # Fail-closed: без Redis проверить тикет нечем, а пускать «на всякий
        # случай» — значит отдавать чужие файлы и чаты.
        logger.warning("Ticket check failed (redis unavailable): %s", exc)
        return None
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None
