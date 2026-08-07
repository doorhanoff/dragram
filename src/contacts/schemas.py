import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

# SHA-256 в шестнадцатеричном виде — ровно 64 символа. Формат проверяем здесь,
# чтобы в сервис не приезжали строки произвольной длины.
Sha256Hex = Annotated[str, StringConstraints(pattern=r"^[0-9a-fA-F]{64}$")]

# Телефонная книга может быть большой, но не бесконечной: каждый лишний хеш —
# это работа на сервере, а полторы тысячи контактов уже редкость.
MAX_CONTACTS = 2000


class DiscoverBody(BaseModel):
    hashes: list[Sha256Hex] = Field(min_length=1, max_length=MAX_CONTACTS)

    model_config = ConfigDict(str_strip_whitespace=True)


class DiscoveredContact(BaseModel):
    id: uuid.UUID
    name: str
    image_url: str | None = None
    chat_id: uuid.UUID


class DiscoverResponse(BaseModel):
    matched: list[DiscoveredContact]
