from fastapi import Request

from .service import GateService, make_gate_service

# Сервис без состояния и без внешних соединений — один экземпляр на процесс.
_gate_service = make_gate_service()

GATE_COOKIE = "gate"
GATE_HEADER = "X-Gate-Token"


async def get_gate_service() -> GateService:
    return _gate_service


def extract_gate_token(request: Request) -> str | None:
    """Кука — для веба, заголовок — для мобильного клиента: в Capacitor
    запросы идут кросс-доменно и куки не работают."""
    return request.cookies.get(GATE_COOKIE) or request.headers.get(GATE_HEADER)
