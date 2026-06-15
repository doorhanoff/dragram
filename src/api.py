from fastapi import APIRouter
from .auth.router import router as auth_router
from .chats.router import router as chats_router
from .posts.router import router as posts_router
from .albums.router import router as albums_router
from .notifications.router import router as notifications_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(chats_router)
router.include_router(posts_router)
router.include_router(albums_router)
router.include_router(notifications_router)
