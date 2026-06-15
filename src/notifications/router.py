from fastapi import APIRouter, Depends, status

from .depends import get_notifications_service
from .schemas import RegisterDeviceToken, UnregisterDeviceToken
from .service import NotificationsService
from src.auth.depends import get_current_user
from src.auth.models import UsersOrm

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/register", status_code=status.HTTP_204_NO_CONTENT)
async def register_device(
    data: RegisterDeviceToken,
    user: UsersOrm = Depends(get_current_user),
    service: NotificationsService = Depends(get_notifications_service),
):
    await service.register_token(user.id, data.token, data.platform)


@router.post("/unregister", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_device(
    data: UnregisterDeviceToken,
    user: UsersOrm = Depends(get_current_user),
    service: NotificationsService = Depends(get_notifications_service),
):
    await service.unregister_token(data.token)
