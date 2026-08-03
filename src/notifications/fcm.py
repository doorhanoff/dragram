import json
import logging

import firebase_admin
from firebase_admin import credentials, messaging

from src.config import settings

logger = logging.getLogger(__name__)

_app: firebase_admin.App | None = None
_disabled = False  # креды не заданы — повторные попытки бессмысленны


def _get_app() -> firebase_admin.App | None:
    global _app, _disabled
    if _app is not None or _disabled:
        return _app
    if not settings.FCM_CREDENTIALS_JSON:
        logger.info("FCM_CREDENTIALS_JSON not set — push notifications disabled")
        _disabled = True
        return None
    try:
        cred = credentials.Certificate(json.loads(settings.FCM_CREDENTIALS_JSON))
        _app = firebase_admin.initialize_app(cred)
    except Exception:
        # Не запоминаем неудачу навсегда: причина могла быть временной
        # (сеть), следующий вызов попробует инициализироваться заново.
        logger.exception("Failed to initialize Firebase app")
        _app = None
    return _app


def send_push(
    tokens: list[str],
    title: str,
    body: str,
    data: dict | None = None,
    data_only: bool = False,
) -> list[str]:
    """Блокирующий вызов FCM — вызывать только через asyncio.to_thread.

    data_only=True отправляет push без notification-блока: уведомление рисует
    само приложение, расшифровав текст на устройстве. Notification-блок здесь
    недопустим — Android показал бы его сам, не разбудив наш код.

    Возвращает список токенов, которые FCM признал недействительными
    (приложение удалено и т.п.) — их нужно удалить из БД."""
    app = _get_app()
    if not app or not tokens:
        return []
    message = messaging.MulticastMessage(
        notification=None if data_only else messaging.Notification(title=title, body=body),
        data={k: str(v) for k, v in (data or {}).items()},
        tokens=tokens,
        # high обязателен для data-only: с обычным приоритетом Android
        # придержит сообщение до выхода из Doze, и уведомление опоздает.
        android=messaging.AndroidConfig(priority="high"),
    )
    try:
        batch = messaging.send_each_for_multicast(message, app=app)
    except Exception:
        logger.exception("Failed to send push notification")
        return []

    dead_tokens = []
    for token, resp in zip(tokens, batch.responses):
        if resp.success:
            continue
        if isinstance(resp.exception, messaging.UnregisteredError):
            dead_tokens.append(token)
        else:
            logger.warning("Push to token failed: %s", resp.exception)
    return dead_tokens
