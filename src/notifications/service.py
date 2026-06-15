import uuid

from .repo import NotificationsRepository
from .fcm import send_push


class NotificationsService:
    def __init__(self, repo: NotificationsRepository):
        self.repo = repo

    async def register_token(self, user_id: uuid.UUID, token: str, platform: str) -> None:
        await self.repo.register(user_id, token, platform)

    async def unregister_token(self, token: str) -> None:
        await self.repo.unregister(token)

    async def notify_users(self, user_ids: list[uuid.UUID], title: str, body: str, data: dict | None = None) -> None:
        tokens = await self.repo.get_tokens_for_users(user_ids)
        send_push(tokens, title, body, data)
