from fastapi import Depends, HTTPException, Request, WebSocket, WebSocketException, status
from redis.asyncio import Redis
from src.redis.depends import get_redis_client


def _client_ip(headers, client) -> str:
    forwarded_for = headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return client.host if client else "unknown"


def make_rate_limiter(max_requests: int = 60, window: int = 60):
    """
    Sliding-window rate limiter per (IP, path) через Redis INCR + EXPIRE.

    Использование:
        @router.post("/login", dependencies=[Depends(make_rate_limiter(5, 60))])
    """
    async def rate_limiter(
        request: Request,
        redis: Redis = Depends(get_redis_client),
    ) -> None:
        # Учитываем реальный IP за Nginx (X-Forwarded-For)
        client_ip = _client_ip(request.headers, request.client)
        key   = f"rl:{client_ip}:{request.url.path}"
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, window)
        if count > max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Слишком много запросов. Попробуйте через {window} секунд.",
                headers={"Retry-After": str(window)},
            )

    return rate_limiter


def make_ws_rate_limiter(max_requests: int = 20, window: int = 60):
    """
    Тот же принцип, что и make_rate_limiter (Redis INCR + EXPIRE по IP и пути),
    но для WebSocket: ограничивает частоту ПОПЫТОК ПОДКЛЮЧЕНИЯ, а не сообщений
    внутри уже открытого сокета.

    Использование:
        @router.websocket("/ws/{chat_id}", dependencies=[Depends(make_ws_rate_limiter(20, 60))])
    """
    async def ws_rate_limiter(
        websocket: WebSocket,
        redis: Redis = Depends(get_redis_client),
    ) -> None:
        client_ip = _client_ip(websocket.headers, websocket.client)
        key   = f"rl:ws:{client_ip}:{websocket.url.path}"
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, window)
        if count > max_requests:
            raise WebSocketException(code=4029, reason="Too many connection attempts")

    return ws_rate_limiter
