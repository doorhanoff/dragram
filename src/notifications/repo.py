import uuid
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from .models import DeviceTokenOrm


class NotificationsRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def register(self, user_id: uuid.UUID, token: str, platform: str) -> None:
        # Токен может быть переустановлен на другом аккаунте/после переустановки —
        # удаляем старую привязку перед созданием новой.
        await self.session.execute(delete(DeviceTokenOrm).where(DeviceTokenOrm.token == token))
        self.session.add(DeviceTokenOrm(user_id=user_id, token=token, platform=platform))
        await self.session.commit()

    async def unregister(self, token: str) -> None:
        await self.session.execute(delete(DeviceTokenOrm).where(DeviceTokenOrm.token == token))
        await self.session.commit()

    async def get_tokens_for_users(self, user_ids: list[uuid.UUID]) -> list[str]:
        if not user_ids:
            return []
        res = await self.session.execute(
            select(DeviceTokenOrm.token).where(DeviceTokenOrm.user_id.in_(user_ids))
        )
        return [row[0] for row in res.all()]
