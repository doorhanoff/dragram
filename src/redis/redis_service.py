import logging
import redis.asyncio as redis
from src.config import settings

logger = logging.getLogger(__name__)

_redis: redis.Redis | None = None
_redis_pubsub: redis.Redis | None = None


async def init_redis():
    global _redis, _redis_pubsub
    if settings.REDIS_URL:
        logger.info("Connecting to Redis via REDIS_URL: %s", settings.REDIS_URL)
        _redis = redis.Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
        # Отдельное соединение для pub/sub: .listen() специально ждёт следующее
        # сообщение сколь угодно долго (block=True), но общий socket_timeout=5
        # всё равно применяется к этому ожиданию и рвёт соединение по таймауту,
        # если в канале тихо больше 5 секунд — а для чата это норма, а не сбой.
        # Вместо read-таймаута — TCP keepalive: он ловит по-настоящему мёртвое
        # соединение, не полагаясь на то, что в канале постоянно что-то летит.
        _redis_pubsub = redis.Redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_keepalive=True,
        )
    else:
        logger.info(
            "Connecting to Redis: host=%s port=%s ssl=%s user=%s password=%s",
            settings.REDIS_HOST,
            settings.REDIS_PORT,
            settings.REDIS_SSL,
            settings.REDIS_USER or "(none)",
            "***" if settings.REDIS_PASSWORD else "(none)",
        )
        _redis = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            decode_responses=True,
            ssl=settings.REDIS_SSL,
            password=settings.REDIS_PASSWORD or None,
            username=settings.REDIS_USER or None,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
        _redis_pubsub = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            decode_responses=True,
            ssl=settings.REDIS_SSL,
            password=settings.REDIS_PASSWORD or None,
            username=settings.REDIS_USER or None,
            socket_connect_timeout=5,
            socket_keepalive=True,
        )
    try:
        pong = await _redis.ping()
        logger.info("Redis ping: %s", pong)
    except Exception as e:
        logger.error("Redis ping FAILED: %s", e)


async def close_redis():
    global _redis, _redis_pubsub
    if _redis:
        await _redis.aclose()
        _redis = None
    if _redis_pubsub:
        await _redis_pubsub.aclose()
        _redis_pubsub = None


def get_redis() -> redis.Redis:
    if not _redis:
        raise RuntimeError("Redis not initialized")
    return _redis


def get_redis_pubsub() -> redis.Redis:
    if not _redis_pubsub:
        raise RuntimeError("Redis pubsub client not initialized")
    return _redis_pubsub
