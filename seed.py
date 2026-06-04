"""
Seed script — создаёт 3 тестовых пользователя.

Запуск:
  docker compose exec fastapi uv run python seed.py
"""
import asyncio
import uuid

from sqlalchemy import select
from src.db.database import async_session
from src.auth.models import UsersOrm
from src.core.hashing import hash_password

USERS = [
    {
        "name":         "Алексей Иванов",
        "phone_number": "+79001111111",
        "password":     "password123",
        "description":  "Привет, я Алексей!",
    },
    {
        "name":         "Мария Петрова",
        "phone_number": "+79002222222",
        "password":     "password123",
        "description":  "Привет, я Мария!",
    },
    {
        "name":         "Дмитрий Сидоров",
        "phone_number": "+79003333333",
        "password":     "password123",
        "description":  "Привет, я Дмитрий!",
    },
]


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
        print("\nДанные для входа (пароль у всех: password123):")
        for u in USERS:
            print(f"  {u['phone_number']}  /  {u['password']}")


if __name__ == "__main__":
    asyncio.run(seed())
