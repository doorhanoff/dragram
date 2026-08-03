import uuid
from sqlalchemy import select, delete
from src.db.repository import BaseRepository
from .models import DeviceTokenOrm


class NotificationsRepository(BaseRepository):

    async def register(self, user_id: uuid.UUID, token: str, platform: str) -> None:
        # Токен может быть переустановлен на другом аккаунте/после переустановки —
        # удаляем старую привязку перед созданием новой.
        await self.session.execute(delete(DeviceTokenOrm).where(DeviceTokenOrm.token == token))
        self.session.add(DeviceTokenOrm(user_id=user_id, token=token, platform=platform))

    async def unregister(self, user_id: uuid.UUID, token: str) -> None:
        # Фильтр по user_id обязателен: иначе любой авторизованный пользователь
        # может отписать чужое устройство, зная его токен.
        await self.session.execute(
            delete(DeviceTokenOrm).where(
                DeviceTokenOrm.token == token,
                DeviceTokenOrm.user_id == user_id,
            )
        )

    async def remove_tokens(self, tokens: list[str]) -> None:
        if not tokens:
            return
        await self.session.execute(delete(DeviceTokenOrm).where(DeviceTokenOrm.token.in_(tokens)))

    async def get_tokens_for_users(self, user_ids: list[uuid.UUID]) -> list[tuple[str, str]]:
        """Возвращает пары (token, platform): расшифровывать уведомление умеет
        только нативный Android-клиент, остальным платформам нужен обычный push."""
        if not user_ids:
            return []
        res = await self.session.execute(
            select(DeviceTokenOrm.token, DeviceTokenOrm.platform)
            .where(DeviceTokenOrm.user_id.in_(user_ids))
        )
        return [(row[0], row[1]) for row in res.all()]
