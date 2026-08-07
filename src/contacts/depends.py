from fastapi import Depends

from src.auth.depends import get_auth_repo
from src.auth.repo import AuthRepository
from src.chats.depends import get_chats_service
from src.chats.service import ChatsService
from .service import ContactsService


async def get_contacts_service(
    auth_repo: AuthRepository = Depends(get_auth_repo),
    chats: ChatsService = Depends(get_chats_service),
) -> ContactsService:
    # Оба репозитория получают одну и ту же сессию: FastAPI кеширует
    # зависимость get_async_session в пределах запроса, поэтому поиск
    # контактов и создание чатов идут одной транзакцией.
    return ContactsService(auth_repo, chats)
