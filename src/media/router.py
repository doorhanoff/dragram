"""Выдача медиафайлов.

Бакет в Object Storage закрыт (см. DEPLOY.md): прямых публичных ссылок на
загрузки больше нет. Файл можно получить только через эту ручку — она
проверяет, что запрос идёт от вошедшего пользователя, и отдаёт 302 на
presigned-ссылку с коротким TTL. Трафик при этом по-прежнему идёт мимо VPS,
напрямую из хранилища.

Авторизация принимается тремя способами:
  * кука `token` — веб;
  * `Authorization: Bearer` — там, где заголовок можно задать;
  * `?t=<ticket>` — для `<img src>`/`<video src>`, где заголовка нет.

Проверяется факт входа, а не права на конкретный файл: одна и та же картинка
может лежать в чате, в посте и в альбоме, и «кому она принадлежит» без
отдельного индекса владения не ответить. Главное свойство всё равно
достигнуто — из интернета без аккаунта файл не достать.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse

from src.config import settings
from src.core.rate_limit import make_rate_limiter
from .depends import get_media_service, get_media_viewer, get_ticket_requester
from .service import MediaService

router = APIRouter(prefix="/media", tags=["media"])


@router.post("/ticket")
async def create_media_ticket(
    user_id: uuid.UUID = Depends(get_ticket_requester),
    service: MediaService = Depends(get_media_service),
):
    """Тикет для `<img src>`: клиент берёт его при входе и подставляет во все
    ссылки на медиа."""
    ticket, expires_in = await service.issue_ticket(user_id)
    return {"ticket": ticket, "expires_in": expires_in}


@router.get(
    "/{key:path}",
    dependencies=[
        Depends(get_media_viewer),
        # Лимит щедрый: одна открытая лента — это десятки картинок.
        Depends(make_rate_limiter(max_requests=600, window=60)),
    ],
)
async def get_media(key: str, service: MediaService = Depends(get_media_service)):
    if not service.is_servable(key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return RedirectResponse(
        await service.link_for(key),
        status_code=status.HTTP_302_FOUND,
        # private: ссылка персональная, промежуточным кешам её хранить нельзя.
        # Кешируем чуть меньше, чем живёт сама подпись, иначе браузер успеет
        # переиспользовать редирект на уже протухший URL.
        headers={"Cache-Control": f"private, max-age={max(settings.MEDIA_LINK_TTL - 60, 60)}"},
    )
