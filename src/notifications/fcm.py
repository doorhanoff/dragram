import json
import logging

import firebase_admin
from firebase_admin import credentials, messaging

from src.config import settings

logger = logging.getLogger(__name__)

_app: firebase_admin.App | None = None
_init_attempted = False


def _get_app() -> firebase_admin.App | None:
    global _app, _init_attempted
    if _app is not None or _init_attempted:
        return _app
    _init_attempted = True
    if not settings.FCM_CREDENTIALS_JSON:
        logger.info("FCM_CREDENTIALS_JSON not set — push notifications disabled")
        return None
    try:
        cred = credentials.Certificate(json.loads(settings.FCM_CREDENTIALS_JSON))
        _app = firebase_admin.initialize_app(cred)
    except Exception:
        logger.exception("Failed to initialize Firebase app")
        _app = None
    return _app


def send_push(tokens: list[str], title: str, body: str, data: dict | None = None) -> None:
    app = _get_app()
    if not app or not tokens:
        return
    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        data={k: str(v) for k, v in (data or {}).items()},
        tokens=tokens,
    )
    try:
        messaging.send_each_for_multicast(message, app=app)
    except Exception:
        logger.exception("Failed to send push notification")
