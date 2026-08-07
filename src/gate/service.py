"""Дверь перед сайтом: два общих ответа вместо публичного доступа.

Что здесь важно и почему сделано именно так:

* Проверка только на сервере. Сравнение в браузере бессмысленно: ответы
  оказались бы в бандле и читались через «посмотреть код».
* В конфиге лежат Argon2-хеши, а не ответы. Ни в репозитории, ни в образе,
  ни в `.env` на сервере правильных ответов нет — их оттуда не достать.
* Ответ на неудачу всегда один и тот же. Иначе по разнице сообщений можно
  подбирать поля по одному, а это резко дешевле, чем оба сразу.
* Пройденная дверь запоминается подписанным токеном, а не флагом в браузере:
  флаг подделывается из консоли за секунду.
"""
import datetime
import logging
import re
import unicodedata

import jwt

from src.config import settings
from src.core.hashing import hash_password, verify_password

logger = logging.getLogger(__name__)

GATE_TOKEN_TYPE = "gate"

MONTHS = {
    "январь": 1, "января": 1, "янв": 1,
    "февраль": 2, "февраля": 2, "фев": 2,
    "март": 3, "марта": 3, "мар": 3,
    "апрель": 4, "апреля": 4, "апр": 4,
    "май": 5, "мая": 5,
    "июнь": 6, "июня": 6, "июн": 6,
    "июль": 7, "июля": 7, "июл": 7,
    "август": 8, "августа": 8, "авг": 8,
    "сентябрь": 9, "сентября": 9, "сен": 9, "сент": 9,
    "октябрь": 10, "октября": 10, "окт": 10,
    "ноябрь": 11, "ноября": 11, "ноя": 11, "нояб": 11,
    "декабрь": 12, "декабря": 12, "дек": 12,
}


def normalize_date(text: str) -> str:
    """Дату приводим к «ДД-ММ»: «16 августа», «16.08», «16 авг 1970» и
    «16/08/70» должны считаться одним и тем же ответом. Год отбрасываем —
    спрашивается день рождения, а не год рождения."""
    lowered = text.strip().lower().replace("ё", "е")
    day = month = None

    for word, number in MONTHS.items():
        if re.search(rf"\b{word}\b", lowered):
            month = number
            break

    numbers = [int(n) for n in re.findall(r"\d+", lowered)]
    if month is not None:
        # Месяц назван словом — днём считаем первое число не больше 31
        day = next((n for n in numbers if 1 <= n <= 31), None)
    elif len(numbers) >= 2:
        day, month = numbers[0], numbers[1]

    if not day or not month or not (1 <= day <= 31 and 1 <= month <= 12):
        return ""
    return f"{day:02d}-{month:02d}"


def normalize_name(text: str) -> str:
    """Имя приводим к отсортированным словам в нижнем регистре: регистр,
    порядок слов, лишние пробелы, дефисы и «ё» не должны мешать тому, кто
    ответ действительно знает."""
    lowered = unicodedata.normalize("NFKC", text).strip().lower().replace("ё", "е")
    words = [w for w in re.split(r"[^0-9a-zа-я]+", lowered) if w]
    return " ".join(sorted(words))


class GateService:
    def __init__(self, secret: str, birthday_hash: str, creator_hash: str, ttl_days: int):
        self._secret = secret
        self._birthday_hash = birthday_hash
        self._creator_hash = creator_hash
        self._ttl = datetime.timedelta(days=ttl_days)

    @property
    def enabled(self) -> bool:
        return bool(self._birthday_hash and self._creator_hash)

    async def unlock(self, birthday: str, creator: str) -> str | None:
        """Возвращает пропуск или None. Проверяются оба ответа целиком:
        выхода по первому несовпадению нет, чтобы по времени ответа нельзя
        было понять, какое из полей угадано."""
        import asyncio

        date_ok, name_ok = await asyncio.gather(
            asyncio.to_thread(verify_password, normalize_date(birthday), self._birthday_hash),
            asyncio.to_thread(verify_password, normalize_name(creator), self._creator_hash),
        )
        if not (date_ok and name_ok):
            return None
        return self._issue()

    def _issue(self) -> str:
        now = datetime.datetime.now(datetime.timezone.utc)
        return jwt.encode(
            {"typ": GATE_TOKEN_TYPE, "iat": now, "exp": now + self._ttl},
            self._secret,
            algorithm="HS256",
        )

    def verify(self, token: str | None) -> bool:
        if not token:
            return False
        try:
            payload = jwt.decode(
                token, self._secret, algorithms=["HS256"], options={"require": ["exp", "typ"]}
            )
        except Exception:
            return False
        # Тип обязателен: без него сюда подошёл бы обычный access-токен,
        # подписанный тем же секретом.
        return payload.get("typ") == GATE_TOKEN_TYPE

    @property
    def ttl_seconds(self) -> int:
        return int(self._ttl.total_seconds())


def make_gate_service() -> GateService:
    return GateService(
        secret=settings.JWT_SECRET_KEY,
        birthday_hash=settings.GATE_BIRTHDAY_HASH,
        creator_hash=settings.GATE_CREATOR_HASH,
        ttl_days=settings.GATE_TTL_DAYS,
    )


def build_hashes(birthday: str, creator: str) -> tuple[str, str]:
    """Хеши для .env. Используется скриптом из deploy/, не приложением."""
    return hash_password(normalize_date(birthday)), hash_password(normalize_name(creator))
