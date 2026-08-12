"""Кто когда был в сети.

«В сети» — ключ с TTL 60 секунд: перестал приходить heartbeat, ключ погас.
Этого достаточно для зелёной точки, но не для строки «был вчера в 21:40»,
поэтому рядом лежит вечный `last_seen:<id>` с меткой последнего heartbeat.

В Redis, а не в базе: запись идёт каждые 25 секунд с каждого устройства, и
столько же UPDATE'ов в Postgres на пустом месте не нужны. Данные не критичны —
потеря Redis стоит лишь пропавшей строки «был недавно».
"""
import datetime
import uuid

ONLINE_TTL = 60

# Как часто отметка уходит в базу. Heartbeat приходит каждые 25 секунд с
# каждого устройства — столько же UPDATE'ов не нужно, а вот пережить перезапуск
# Redis отметка должна: иначе у всех разом пропадает строка «был вчера в 21:40»
# и остаётся глухое «не в сети».
PERSIST_EVERY = 10 * 60


def online_key(user_id: uuid.UUID | str) -> str:
    return f"online:{user_id}"


def last_seen_key(user_id: uuid.UUID | str) -> str:
    return f"last_seen:{user_id}"


def persist_lock_key(user_id: uuid.UUID | str) -> str:
    return f"last_seen_saved:{user_id}"


async def touch_presence(redis, user_id: uuid.UUID | str, persist=None) -> None:
    """Отмечает, что человек сейчас в сети.

    persist — необязательный колбэк, которым отметка кладётся в базу. Зовётся
    не чаще раза в PERSIST_EVERY: ключ с nx=True играет роль замка, и второй
    heartbeat в ту же десятиминутку до базы уже не доходит.
    """
    now = datetime.datetime.now(datetime.UTC)
    await redis.set(online_key(user_id), "1", ex=ONLINE_TTL)
    await redis.set(last_seen_key(user_id), now.isoformat())
    if persist is None:
        return
    first_in_window = await redis.set(persist_lock_key(user_id), "1", ex=PERSIST_EVERY, nx=True)
    if first_in_window:
        await persist(now)


def parse_last_seen(raw) -> datetime.datetime | None:
    """Мусор в ключе не должен ронять список чатов или профиль."""
    if not raw:
        return None
    if isinstance(raw, bytes):
        raw = raw.decode(errors="ignore")
    try:
        return datetime.datetime.fromisoformat(raw)
    except ValueError:
        return None
