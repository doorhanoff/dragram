import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import insert, select, or_, func
from sqlalchemy.orm import selectinload
from .schemas import CreateUser
from .models import UsersOrm

SIMILARITY_THRESHOLD = 0.15


class AuthRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_user(self, credentials: CreateUser) -> UsersOrm:
        stmt = insert(UsersOrm).values(credentials.model_dump()).returning(UsersOrm)
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.scalar_one()

    async def get_user_by_phone(self, phone_number: str) -> UsersOrm | None:
        stmt = select(UsersOrm).where(UsersOrm.phone_number == phone_number)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_by_id(self, user_id: uuid.UUID) -> UsersOrm | None:
        from src.chats.models import ChatsOrm  # runtime import — избегаем circular на уровне модуля
        stmt = (
            select(UsersOrm)
            .options(
                selectinload(UsersOrm.chats).selectinload(ChatsOrm.members)
            )
            .where(UsersOrm.id == user_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def set_key_backup(self, user_id: uuid.UUID, backup: str) -> None:
        from sqlalchemy import update
        stmt = (
            update(UsersOrm)
            .where(UsersOrm.id == user_id, UsersOrm.key_backup.is_(None))
            .values(key_backup=backup)
        )
        await self.session.execute(stmt)
        await self.session.commit()

    async def get_key_backup(self, user_id: uuid.UUID) -> str | None:
        stmt = select(UsersOrm.key_backup).where(UsersOrm.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def set_active(self, user_id: uuid.UUID, active: bool) -> None:
        from sqlalchemy import update
        stmt = update(UsersOrm).where(UsersOrm.id == user_id).values(is_active=active)
        await self.session.execute(stmt)
        await self.session.commit()

    async def update_profile(self, user_id: uuid.UUID, name: str | None, description: str | None) -> None:
        from sqlalchemy import update
        values = {}
        if name is not None:
            values["name"] = name
        if description is not None:
            values["description"] = description
        if not values:
            return
        stmt = update(UsersOrm).where(UsersOrm.id == user_id).values(**values)
        await self.session.execute(stmt)
        await self.session.commit()

    async def update_avatar(self, user_id: uuid.UUID, image_url: str) -> None:
        from sqlalchemy import update
        stmt = update(UsersOrm).where(UsersOrm.id == user_id).values(image_url=image_url)
        await self.session.execute(stmt)
        await self.session.commit()

    async def set_public_key(self, user_id: uuid.UUID, public_key: str) -> None:
        from sqlalchemy import update
        stmt = (
            update(UsersOrm)
            .where(UsersOrm.id == user_id, UsersOrm.public_key.is_(None))
            .values(public_key=public_key)
        )
        await self.session.execute(stmt)
        await self.session.commit()

    async def get_public_key(self, user_id: uuid.UUID) -> str | None:
        stmt = select(UsersOrm.public_key).where(UsersOrm.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def search(self, text: str | None, limit: int, offset: int) -> list[UsersOrm]:
        if not text:
            return []

        name_sim = func.similarity(UsersOrm.name, text)
        query = (
            select(UsersOrm)
            .where(
                or_(
                    name_sim > SIMILARITY_THRESHOLD,
                    UsersOrm.phone_number.ilike(f"%{text}%"),
                )
            )
            .order_by(name_sim.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(query)
        return result.scalars().all()

