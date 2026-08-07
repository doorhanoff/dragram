"""Поиск знакомых по телефонной книге.

Главное решение здесь — **на сервер уезжают не номера, а их хеши**.

Телефонная книга — это данные не только владельца телефона, но и всех, кто
в неё записан: люди, которые про Dragram ничего не знают и согласия не
давали. Если слать номера как есть, сервер соберёт адресные книги всех
пользователей — так делает WhatsApp, и это ровно то, за что его ругают.
Клиент присылает SHA-256 нормализованных номеров, сервер сверяет их с
хешами своих зарегистрированных пользователей и **ничего не сохраняет**:
несовпавшие хеши забываются сразу после ответа.

Честная оговорка: пространство телефонных номеров маленькое, и хеш номера
подбирается перебором. Это защита от «сервер накопил чужие адресные книги»,
а не криптографическая тайна. Настоящее решение (private set intersection,
как в Signal) для полусотни пользователей — из пушки по воробьям.
"""
import hashlib
import logging
import re
import uuid

from src.auth.models import UsersOrm
from src.auth.repo import AuthRepository
from src.chats.schemas import CreateChat
from src.chats.service import ChatsService

logger = logging.getLogger(__name__)


def normalize_phone(raw: str) -> str | None:
    """Приводит номер к виду 79XXXXXXXXX.

    В базе номера лежат в национальном формате («8 (910) 164-96-04»), а из
    телефонной книги приходят как угодно: «+7 910…», «8-910…», со скобками и
    пробелами. Без общего вида не совпадёт ничего.
    """
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 11 and digits[0] == "8":
        digits = "7" + digits[1:]
    elif len(digits) == 10:
        digits = "7" + digits
    if len(digits) != 11 or digits[0] != "7":
        return None
    return digits


def phone_hash(raw: str) -> str | None:
    normalized = normalize_phone(raw)
    if not normalized:
        return None
    return hashlib.sha256(normalized.encode()).hexdigest()


class ContactsService:
    def __init__(self, auth_repo: AuthRepository, chats: ChatsService):
        self.auth_repo = auth_repo
        self.chats = chats

    async def discover(self, user: UsersOrm, hashes: list[str]) -> list[dict]:
        """Находит зарегистрированных знакомых и сразу заводит с ними чаты."""
        wanted = {h.lower() for h in hashes}
        registered = await self.auth_repo.list_phones()

        matched: list[tuple[uuid.UUID, str, str | None]] = []
        for user_id, phone, name, image_url in registered:
            if user_id == user.id:
                continue  # сам себе не контакт
            h = phone_hash(phone)
            if h and h in wanted:
                matched.append((user_id, name, image_url))

        logger.info(
            "Contacts sync: user_id=%s, прислано хешей=%s, найдено=%s",
            user.id, len(wanted), len(matched),
        )

        result = []
        for user_id, name, image_url in matched:
            # create() сам вернёт существующий чат, если он уже есть, —
            # повторная синхронизация не плодит дубликаты.
            chat = await self.chats.create(CreateChat(members=[user_id]), user)
            result.append({
                "id": user_id, "name": name, "image_url": image_url,
                "chat_id": chat.id,
            })
        return result
