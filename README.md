# Dragram

A real-time messaging and social platform — encrypted group/private chats, media sharing, and a post feed — delivered as a web app and a native Android app from a single codebase.

---

## Stack

| Layer | Technology |
|---|---|
| **Backend** | FastAPI · SQLAlchemy 2 (async) · PostgreSQL 16 · Alembic |
| **Auth / Sessions** | JWT (access + refresh) · Redis token store |
| **Media Storage** | S3-compatible (Yandex Cloud Object Storage by default) |
| **Realtime** | WebSockets (FastAPI native) |
| **Frontend** | React 18 · Vite · TypeScript · Tailwind CSS |
| **Mobile** | Capacitor 6 (Android) · `@capacitor/status-bar` |
| **Containerisation** | Docker · Docker Compose · Nginx reverse proxy |
| **Deployment** | Railway (backend + PostgreSQL + Redis) |

---

## Features

- **Private & group chats** — real-time messaging over WebSocket
- **End-to-end encryption keys** — per-chat public key exchange and encrypted key backup
- **Media messages** — images (lightbox viewer), video (fullscreen player), audio (voice recorder)
- **Post feed** — create posts with images/video, like, bookmark, comment
- **User profiles** — avatar, name, description, online status
- **JWT authentication** — short-lived access tokens + long-lived refresh tokens stored as `HttpOnly` cookies
- **Android app** — Capacitor wrapper with edge-to-edge layout, status bar theming, safe-area handling
- **Web + mobile** — identical feature set; one React build powers both

---

## Project Layout

```
dragram/
├── src/                     # Python backend
│   ├── auth/                # Registration, login, JWT, user profiles, avatar upload
│   ├── chats/               # Chat CRUD, messages, WebSocket, media upload, E2E keys
│   ├── posts/               # Post feed, likes, bookmarks, comments
│   ├── jwt_auth/            # JWT encode/decode, Redis token revocation
│   ├── redis/               # Async Redis client & dependency
│   ├── s3/                  # S3 upload service
│   ├── db/                  # SQLAlchemy engine & session factory
│   └── core/                # Rate limiting, shared utilities
├── alembic/                 # Database migrations
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/        # Login / register screens
│   │   │   ├── chat/        # ChatList, ChatView, MessageBubble
│   │   │   ├── posts/       # PostFeed, PostCard, PostThread
│   │   │   ├── layout/      # Sidebar (web), BottomNav (mobile)
│   │   │   └── ui/          # Avatar, ImageLightbox, VideoLightbox, modals
│   │   ├── api.js           # Typed API client (fetch + auto token refresh)
│   │   └── types.ts         # Shared TypeScript interfaces
│   ├── android/             # Capacitor Android project
│   └── capacitor.config.ts
├── nginx/                   # Reverse proxy config
├── Dockerfile               # Multi-stage: Vite build → Python image
├── docker-compose.yaml      # Local stack: postgres + redis + fastapi + nginx
└── entrypoint.sh            # alembic upgrade head → uvicorn
```

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local frontend dev)
- Python 3.12+ with `uv` (for local backend dev)

### 1. Clone & configure

```bash
git clone https://github.com/doorhanoff/dragram.git
cd dragram
cp .env.example .env   # then fill in the values
```

Minimum required `.env`:

```env
# PostgreSQL
DB_HOST=db
DB_PORT=5432
DB_USER=postgres
DB_PASS=yourpassword
DB_NAME=dragram

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT — generate with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET_KEY=change_me

# S3-compatible storage
S3_ENDPOINT=https://storage.yandexcloud.net
S3_REGION=ru-central1
S3_BUCKET=your-bucket
S3_ACCESS_KEY=your-key
S3_SECRET_KEY=your-secret
```

### 2. Run with Docker Compose

```bash
docker compose up --build
```

The stack starts in dependency order: Postgres → Redis → FastAPI (runs migrations on startup) → Nginx.

| URL | What |
|---|---|
| `http://localhost` | Web app (served by Nginx) |
| `http://localhost:8000/docs` | Interactive API docs (Swagger UI) |
| `http://localhost:8000/redoc` | ReDoc |

### 3. Run locally (without Docker)

**Backend:**

```bash
# Start Postgres and Redis however you like, then:
uv sync
uv run alembic upgrade head
uv run uvicorn main:app --reload
```

**Frontend:**

```bash
cd frontend
cp .env.example .env.local   # set VITE_API_URL and VITE_WS_URL
npm install
npm run dev
```

---

## Database Migrations

Migrations live in `alembic/versions/` and are run automatically by `entrypoint.sh` on every deploy.

```bash
# Create a new migration
uv run alembic revision --autogenerate -m "description"

# Apply
uv run alembic upgrade head

# Roll back one step
uv run alembic downgrade -1
```

---

## Building the Android APK

The Capacitor project in `frontend/android/` points to the production backend by default (`capacitor.config.ts`). For local testing, change `server.url` to your machine's IP.

```bash
cd frontend

# 1. Build the web bundle
npm run build

# 2. Sync into the Android project
npx cap sync android

# 3. Build a debug APK
cd android
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk

# Or open in Android Studio for a release build:
npx cap open android
```

Requirements: Android Studio with SDK 35+, Java 17.

---

## API Overview

All endpoints are prefixed with `/api` and documented at `/docs`.

| Prefix | Domain |
|---|---|
| `POST /auth/register` | Create account |
| `POST /auth/login` | Login, sets `HttpOnly` cookie pair |
| `POST /auth/refresh` | Rotate tokens |
| `GET /auth/me` | Current user |
| `PATCH /auth/me` | Update name / description |
| `POST /auth/me/avatar` | Upload avatar |
| `GET /chats/` | List chats |
| `POST /chats/create` | Create private or group chat |
| `GET /chats/{id}/messages` | Paginated message history |
| `WS /chats/{id}/ws` | WebSocket for real-time messages |
| `POST /chats/{id}/upload` | Upload image / video / audio |
| `GET /posts/` | Post feed |
| `POST /posts/create` | Create post with optional media |

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | — | Postgres host |
| `DB_PORT` | `5432` | Postgres port |
| `DB_USER` | — | Postgres user |
| `DB_PASS` | — | Postgres password |
| `DB_NAME` | — | Database name |
| `DB_SSL` | `false` | Enable SSL for cloud DBs |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | `""` | Redis password (if auth enabled) |
| `REDIS_SSL` | `false` | Redis TLS |
| `JWT_SECRET_KEY` | — | Secret for signing JWTs |
| `JWT_ACCESS_TTL` | `900` | Access token lifetime (seconds) |
| `JWT_REFRESH_TTL` | `604800` | Refresh token lifetime (seconds) |
| `S3_ENDPOINT` | Yandex Cloud | S3-compatible endpoint URL |
| `S3_BUCKET` | — | Bucket name |
| `S3_ACCESS_KEY` | — | S3 access key |
| `S3_SECRET_KEY` | — | S3 secret key |

---

## Deployment (Railway)

The repo is deploy-ready for [Railway](https://railway.app). Connect the repo, add a PostgreSQL and Redis service, set the environment variables above, and Railway will build via the `Dockerfile` and run `entrypoint.sh`.

Key things to set in Railway:

- `REDIS_HOST=redis.railway.internal` (internal network)
- `REDIS_PORT=6379`
- `DB_SSL=true` for the managed Postgres

---

## License

MIT
