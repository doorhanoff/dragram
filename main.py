import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from src.api import router
from src.config import settings
from src.gate.middleware import GateMiddleware
from src.gate.service import make_gate_service
from src.redis.redis_service import init_redis, close_redis


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_redis()
    yield
    await close_redis()


# Документация — только в разработке: полная карта API закрытого сервиса
# облегчает работу тому, кто ищет в нём дыры, а своим она не нужна.
app = FastAPI(
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

# Дверь добавляется ПОСЛЕ CORS: middleware в Starlette выполняются в обратном
# порядке добавления, а значит CORS отработает первым и браузер увидит
# заголовки даже на ответе «нужен пропуск» — иначе фронтенд получил бы
# невнятную сетевую ошибку вместо 403.
app.add_middleware(GateMiddleware, service=make_gate_service())

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz", include_in_schema=False)
async def healthz():
    """Для healthcheck в docker-compose: раньше он дёргал /docs, из-за чего
    документацию нельзя было выключить."""
    return {"status": "ok"}


app.include_router(router)

FRONTEND_DIST = Path("frontend/dist")
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        return FileResponse(FRONTEND_DIST / "index.html")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
