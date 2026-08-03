import asyncio
import uuid

from .repo import NotificationsRepository
from .fcm import send_push


class NotificationsService:
    def __init__(self, repo: NotificationsRepository):
        self.repo = repo

    async def register_token(self, user_id: uuid.UUID, token: str, platform: str) -> None:
        await self.repo.register(user_id, token, platform)
        await self.repo.commit()

    async def unregister_token(self, user_id: uuid.UUID, token: str) -> None:
        await self.repo.unregister(user_id, token)
        await self.repo.commit()

    async def notify_users(
        self,
        user_ids: list[uuid.UUID],
        title: str,
        body: str,
        data: dict | None = None,
        decryptable: bool = False,
    ) -> None:
        """decryptable=True — в data лежит шифротекст, который получатель может
        расшифровать сам. Такие push уходят на Android как data-only; остальным
        платформам шифротекст бесполезен, им шлём обычное уведомление."""
        rows = await self.repo.get_tokens_for_users(user_ids)
        if decryptable:
            native = [token for token, platform in rows if platform == "android"]
            plain = [token for token, platform in rows if platform != "android"]
            plain_data = {k: v for k, v in (data or {}).items() if k != "ct"}
        else:
            native, plain = [], [token for token, _ in rows]
            plain_data = data

        # firebase-admin синхронный: без to_thread HTTP-запрос к FCM
        # блокировал бы event loop для всех запросов приложения.
        dead_tokens: list[str] = []
        if native:
            dead_tokens += await asyncio.to_thread(send_push, native, title, body, data, True)
        if plain:
            dead_tokens += await asyncio.to_thread(send_push, plain, title, body, plain_data)

        if dead_tokens:
            await self.repo.remove_tokens(dead_tokens)
            await self.repo.commit()
