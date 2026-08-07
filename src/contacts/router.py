from fastapi import APIRouter, Depends

from src.auth.depends import get_current_user
from src.auth.models import UsersOrm
from src.core.rate_limit import make_rate_limiter
from .depends import get_contacts_service
from .schemas import DiscoverBody, DiscoverResponse
from .service import ContactsService

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.post(
    "/discover",
    response_model=DiscoverResponse,
    # Синхронизация — редкая операция: при первом входе и по кнопке. Частые
    # вызовы означали бы перебор хешей, а не работу с телефонной книгой.
    dependencies=[Depends(make_rate_limiter(max_requests=20, window=3600))],
)
async def discover(
    body: DiscoverBody,
    user: UsersOrm = Depends(get_current_user),
    service: ContactsService = Depends(get_contacts_service),
):
    """Находит зарегистрированных знакомых по телефонной книге и сразу
    заводит с ними чаты.

    Принимает хеши номеров, а не номера: адресная книга содержит данные людей,
    которые про сервис ничего не знают. Несовпавшие хеши нигде не сохраняются.
    """
    matched = await service.discover(user, body.hashes)
    return DiscoverResponse(matched=matched)
