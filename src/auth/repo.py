import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import insert, select
from .schemas import CreateUser
from .models import UsersOrm


class AuthRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_user(self, credentials: CreateUser) -> UsersOrm:
        stmt = insert(UsersOrm).values(credentials.model_dump()).returning(UsersOrm)
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.scalar_one()

    async def get_user_by_email(self, email: str) -> UsersOrm | None:
        stmt = select(UsersOrm).where(UsersOrm.email == email)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_by_id(self, user_id: uuid.UUID) -> UsersOrm | None:
        stmt = select(UsersOrm).where(UsersOrm.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
