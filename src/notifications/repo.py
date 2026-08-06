import uuid
from sqlalchemy import select, delete
from src.db.repository import BaseRepository
from .models import DeviceTokenOrm


class NotificationsRepository(BaseRepository):

    async def register(self, user_id: uuid.UUID, token: str, platform: str) -> uuid.UUID | None:
        """Привязывает push-токен к пользователю.

        Токен принадлежит устройству, а не аккаунту: после переустановки
        приложения или смены аккаунта на том же телефоне он приходит с новым
        user_id, и старую привязку надо снять — иначе на устройство продолжат
        сыпаться чужие уведомления. Возвращает прежнего владельца, если он был
        другим: такой «переезд» стоит увидеть в журнале, потому что тем же
        путём чужой токен можно и увести.
        """
        res = await self.session.execute(
            select(DeviceTokenOrm.user_id).where(DeviceTokenOrm.token == token)
        )
        previous_owner = res.scalar_one_or_none()
        await self.session.execute(delete(DeviceTokenOrm).where(DeviceTokenOrm.token == token))
        self.session.add(DeviceTokenOrm(user_id=user_id, token=token, platform=platform))
        return previous_owner if previous_owner and previous_owner != user_id else None

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
