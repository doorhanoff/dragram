"""
Seed script — создаёт 3 тестовых пользователя ТОЛЬКО для разработки.

Запуск:
  docker compose exec fastapi uv run python seed.py

На боевом сервере не запускается: раньше скрипт создавал три аккаунта с
паролем password123 и печатал их в консоль — один запуск по ошибке, и в
закрытом мессенджере появлялись три готовых входа. Пароли теперь случайные
и печатаются один раз.
"""
import asyncio
import secrets
import uuid

from sqlalchemy import select
from src.config import settings
from src.db.database import async_session
from src.auth.models import UsersOrm
from src.core.hashing import hash_password


def _password() -> str:
    return secrets.token_urlsafe(12)


USERS = [
    {
        "name":         "Алексей Иванов",
        "phone_number": "+79001111111",
        "password":     _password(),
        "description":  "Привет, я Алексей!",
    },
    {
        "name":         "Мария Петрова",
        "phone_number": "+79002222222",
        "password":     _password(),
        "description":  "Привет, я Мария!",
    },
    {
        "name":         "Дмитрий Сидоров",
        "phone_number": "+79003333333",
        "password":     _password(),
        "description":  "Привет, я Дмитрий!",
    },
]


def _guard_production() -> None:
    if settings.is_production:
        raise SystemExit(
            "seed.py — только для разработки: на сервере задан DOMAIN. "
            "Если это действительно нужно, создайте пользователя вручную."
        )


async def seed():
    async with async_session() as session:
        created = 0
        skipped = 0

        for u in USERS:
            exists = await session.execute(
                select(UsersOrm).where(UsersOrm.phone_number == u["phone_number"])
            )
            if exists.scalar_one_or_none():
                print(f"  ⏭  {u['name']} уже существует — пропускаем")
                skipped += 1
                continue

            user = UsersOrm(
                id=uuid.uuid4(),
                name=u["name"],
                phone_number=u["phone_number"],
                password_hash=hash_password(u["password"]),
                description=u["description"],
                is_admin=False,
                is_active=False,
            )
            session.add(user)
            created += 1
            print(f"  ✅  {u['name']} ({u['phone_number']}) — создан")

        await session.commit()
        print(f"\nГотово: создано {created}, пропущено {skipped}")
        if created:
            print("\nДанные для входа (пароли сгенерированы сейчас, больше их взять негде):")
            for u in USERS:
                print(f"  {u['phone_number']}  /  {u['password']}")


if __name__ == "__main__":
    _guard_production()
    asyncio.run(seed())
