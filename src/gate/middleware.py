"""Проверка двери до всех маршрутов.

Спрятать форму входа во фронтенде недостаточно: `/auth/login` и остальные
ручки как были доступны напрямую, так и остались бы — достаточно curl.
Поэтому дверь стоит здесь, на уровне ASGI, и закрывает вообще все данные,
включая websocket.

Открыто без пропуска ровно то, без чего нельзя показать саму дверь:
оболочка приложения, её статика и ручки /gate. Данных в них нет.
"""
import logging

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from .service import GateService

logger = logging.getLogger(__name__)

# Всё, что отдаёт данные. Проверяется по началу пути, поэтому вложенные
# маршруты закрыты автоматически.
PROTECTED_PREFIXES = (
    "/auth", "/chats", "/posts", "/albums", "/notifications", "/media", "/contacts",
)

# Исключения: сюда пропуск не донести технически.
#
# Браузерный WebSocket не умеет задавать заголовки, а `<img src>` — тем более;
# на мобильном клиенте кук нет вовсе (запросы кросс-доменные), поэтому дверь
# отсекала и чат, и картинки — на сайте всё работало, а в приложении нет.
#
# Дыры это не открывает: оба пути требуют собственный короткоживущий тикет
# (ws-тикет на 30 секунд, медиа-тикет на час), а выдаются они только
# ручками, которые сами стоят за дверью и требуют входа в аккаунт.
TICKETED_PREFIXES = ("/chats/ws/", "/media/")

GATE_COOKIE = "gate"
GATE_HEADER = b"x-gate-token"


class GateMiddleware:
    def __init__(self, app: ASGIApp, service: GateService):
        self.app = app
        self.service = service

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket") or not self.service.enabled:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path.startswith(TICKETED_PREFIXES):
            await self.app(scope, receive, send)
            return
        if not path.startswith(PROTECTED_PREFIXES) or self._has_pass(scope):
            await self.app(scope, receive, send)
            return

        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 4003})
            return

        response = JSONResponse(
            {"detail": "gate_required"},
            status_code=403,
        )
        await response(scope, receive, send)

    def _has_pass(self, scope: Scope) -> bool:
        headers = dict(scope.get("headers") or [])
        token = headers.get(GATE_HEADER, b"").decode("latin-1") or None
        if not token:
            # Кука: разбираем сами, Request здесь строить незачем.
            raw = headers.get(b"cookie", b"").decode("latin-1")
            for part in raw.split(";"):
                name, _, value = part.strip().partition("=")
                if name == GATE_COOKIE:
                    token = value
                    break
        return self.service.verify(token)
