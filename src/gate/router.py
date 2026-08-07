import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from src.config import settings
from src.core.rate_limit import make_rate_limiter
from .depends import GATE_COOKIE, extract_gate_token, get_gate_service
from .schemas import GateStatus, UnlockBody
from .service import GateService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/gate", tags=["gate"])


@router.get("/status", response_model=GateStatus)
async def gate_status(request: Request, service: GateService = Depends(get_gate_service)):
    """Нужна ли дверь и пройдена ли она. Единственное, что отсюда можно
    узнать, — включена ли проверка; сами ответы не участвуют."""
    return GateStatus(
        enabled=service.enabled,
        unlocked=not service.enabled or service.verify(extract_gate_token(request)),
    )


@router.post(
    "/unlock",
    # Лимит жёсткий и fail-closed: ответов немного, и без ограничения их
    # реально перебрать. Пять попыток в час с адреса делают перебор
    # бессмысленным, а тому, кто ответы знает, хватает и одной.
    dependencies=[Depends(make_rate_limiter(max_requests=5, window=3600, fail_closed=True))],
)
async def unlock(
    body: UnlockBody,
    request: Request,
    response: Response,
    service: GateService = Depends(get_gate_service),
):
    if not service.enabled:
        return {"ok": True, "token": None}

    token = await service.unlock(body.birthday, body.creator)
    if not token:
        # Одна и та же ошибка на любой неверный ответ: если сказать, какое
        # поле не сошлось, подбирать можно будет по одному, а это на порядки
        # дешевле, чем угадывать оба сразу.
        logger.warning("Gate: неверная попытка входа с %s", request.client.host if request.client else "?")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Неверные данные")

    response.set_cookie(
        GATE_COOKIE, token,
        httponly=True, secure=not settings.DEBUG, samesite="lax",
        max_age=service.ttl_seconds,
    )
    # Токен в теле — для мобильного клиента, где кук нет.
    return {"ok": True, "token": token}
