from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis
from src.redis.depends import get_redis_client


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
        forwarded_for = request.headers.get("X-Forwarded-For")
        client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else (
            request.client.host if request.client else "unknown"
        )
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
