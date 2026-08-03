import logging

from fastapi import Depends, HTTPException, WebSocketException, status
from fastapi.requests import HTTPConnection
from redis.asyncio import Redis
from redis.exceptions import RedisError

from src.config import settings
from src.redis.depends import get_redis_client

logger = logging.getLogger(__name__)


def _client_ip(headers, client) -> str:
    """Fixed-window лимитер по IP. X-Forwarded-For нельзя брать целиком —
    клиент может дописать в него что угодно. Доверяем только последним
    TRUSTED_PROXY_COUNT значениям: их дописали наши прокси, и N-е с конца —
    это адрес, с которого реально пришли к первому доверенному прокси."""
    forwarded_for = headers.get("X-Forwarded-For")
    if forwarded_for:
        hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
        trusted = max(settings.TRUSTED_PROXY_COUNT, 1)
        if hops:
            return hops[-trusted] if len(hops) >= trusted else hops[0]
    return client.host if client else "unknown"


def _route_path(scope) -> str:

    route = scope.get("route")
    return getattr(route, "path", None) or scope.get("path", "")


async def _hit(redis: Redis, key: str, window: int) -> int | None:
    try:
        pipe = redis.pipeline()
        pipe.set(key, 0, ex=window, nx=True)
        pipe.incr(key)
        _, count = await pipe.execute()
        return count
    except RedisError as exc:
        logger.warning("Rate limiter unavailable, letting request through: %s", exc)
        return None


def _too_many_requests(window: int) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=f"Слишком много запросов. Попробуйте через {window} секунд.",
        headers={"Retry-After": str(window)},
    )


def make_rate_limiter(max_requests: int = 60, window: int = 60):
    async def rate_limiter(
        conn: HTTPConnection,
        redis: Redis = Depends(get_redis_client),
    ) -> None:
        client_ip = _client_ip(conn.headers, conn.client)
        key = f"rl:ip:{client_ip}:{_route_path(conn.scope)}"
        count = await _hit(redis, key, window)
        if count is None or count <= max_requests:
            return
        if conn.scope["type"] == "websocket":
            raise WebSocketException(code=4029, reason="Too many connection attempts")
        raise _too_many_requests(window)

    return rate_limiter


