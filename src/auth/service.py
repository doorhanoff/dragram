import uuid
import asyncio
import logging

from redis.asyncio import Redis

from src.jwt_auth.jwt_service import TokenInvalidError
from .exceptions import InvalidCredentials, InvalidTokenError, TooManyLoginAttempts, UserNotFoundError
from .repo import AuthRepository
from .schemas import RegisterForm, CreateUser, LoginForm, MyProfileResponse, TokenData, UserShortResponse, \
    UpdateProfileForm
from .models import UsersOrm
from src.core.hashing import hash_password, verify_password
from src.core.rate_limit import hit_counter
from src.core.presence import last_seen_key, online_key, parse_last_seen, touch_presence
from src.core.tickets import WS_TICKET_PREFIX, WS_TICKET_TTL, issue_ticket, redeem_ticket
from src.jwt_auth.jwt_service import JWTManager, TokenPair, TokenType

logger = logging.getLogger(__name__)

# Блокировка перебора по конкретному аккаунту. Ограничение по IP от
# распределённого перебора не спасает: с 50 адресов это 500 попыток в минуту
# по одному номеру.
FAILED_LOGIN_LIMIT = 5
FAILED_LOGIN_WINDOW = 900  # 15 минут

_DUMMY_HASH: str | None = None

async def _get_dummy_hash() -> str:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = await asyncio.to_thread(hash_password, "__dummy__")
    return _DUMMY_HASH


class AuthService:
    def __init__(self, repo: AuthRepository, jwt_manager: JWTManager, redis: Redis):
        self.repo = repo
        self.jwt_manager = jwt_manager
        self.redis = redis

    async def register(self, credentials: RegisterForm) -> UsersOrm:
        hashed = await asyncio.to_thread(hash_password, credentials.password)
        user = CreateUser(
            name=credentials.name,
            phone_number=credentials.phone_number,
            password_hash=hashed,
            description=credentials.description,
        )
        created = await self.repo.create_user(user)
        await self.repo.commit()
        return created

    async def login(self, credentials: LoginForm) -> TokenPair | None:
        fail_key = f"login_fail:{credentials.phone_number}"
        if await self._is_locked_out(fail_key):
            logger.warning("Login blocked, too many failures: phone=%s", credentials.phone_number)
            raise TooManyLoginAttempts(FAILED_LOGIN_WINDOW)

        user = await self.repo.get_user_by_phone(credentials.phone_number)
        password_hash = user.password_hash if user else await _get_dummy_hash()
        ok = await asyncio.to_thread(verify_password, credentials.password, password_hash)
        if not ok or not user:
            await hit_counter(self.redis, fail_key, FAILED_LOGIN_WINDOW)
            logger.warning("Failed login attempt: phone=%s", credentials.phone_number)
            return None

        # Успешный вход обнуляет счётчик: иначе рабочая сессия пользователя
        # блокировалась бы из-за чужих попыток подобрать его пароль.
        await self.redis.delete(fail_key)
        return await self.jwt_manager.create_token_pair(
            subject=str(user.id),
        )

    async def _is_locked_out(self, fail_key: str) -> bool:
        try:
            failures = await self.redis.get(fail_key)
        except Exception as exc:
            # Fail-closed здесь не годится: недоступный Redis запер бы всех.
            # Лимит по IP на этой ручке уже fail-closed и держит оборону.
            logger.warning("Login lockout check unavailable: %s", exc)
            return False
        return failures is not None and int(failures) >= FAILED_LOGIN_LIMIT

    async def get_token_payload(self, access_token: str) -> TokenData:
        payload = await self.jwt_manager.verify_token(access_token)
        return TokenData(id=uuid.UUID(payload.sub))

    async def get_user_by_id(self, user_id: uuid.UUID) -> UserShortResponse | None:
        user = await self.repo.get_user_by_id(user_id)
        if not user:
            return None
        is_online, seen = await self.redis.mget([online_key(user_id), last_seen_key(user_id)])
        response = UserShortResponse.model_validate(user)
        response.is_active = is_online is not None
        # Redis мог перезапуститься — тогда берём отметку из базы.
        response.last_seen = parse_last_seen(seen) or user.last_seen
        return response

    async def get_my_profile(self, user_id: uuid.UUID) -> MyProfileResponse | None:
        """Свой профиль — единственный ответ, где отдаётся номер телефона."""
        user = await self.repo.get_user_by_id(user_id)
        if not user:
            return None
        response = MyProfileResponse.model_validate(user)
        response.is_active = bool(await self.redis.exists(online_key(user_id)))
        return response

    async def logout(
        self,
        *,
        access_token: str | None,
        refresh_token: str | None,
        all_devices: bool = False,
    ) -> None:
        """Отзывает выданные токены.

        Refresh приходит из куки (веб) или из тела запроса (мобильный — там кук
        нет, и раньше выход не аннулировал ничего: токен оставался рабочим ещё
        неделю). Access отзывается заодно, иначе после выхода он жил бы до
        конца своих 15 минут.
        """
        if all_devices:
            user_id = await self._identify(access_token, refresh_token)
            if user_id:
                await self.revoke_all_sessions(user_id)
                logger.info("Logout from all devices: user_id=%s", user_id)
            return
        for token in (refresh_token, access_token):
            if token:
                await self.revoke_token(token)

    async def _identify(self, *tokens: str | None) -> uuid.UUID | None:
        """Первый токен, который удалось разобрать. При выходе на руках может
        оказаться только один из двух — и не обязательно живой."""
        for token in tokens:
            if not token:
                continue
            try:
                payload = await self.get_token_payload(token)
                return payload.id
            except Exception:
                continue
        return None

    async def revoke_all_sessions(self, user_id: uuid.UUID) -> None:
        await self.jwt_manager.revoke_all_for_user(str(user_id))

    async def issue_ws_ticket(self, user_id: uuid.UUID) -> tuple[str, int]:
        """Одноразовый пропуск для websocket: браузерный WebSocket не умеет
        задавать Authorization, а JWT в query-строке оседает в логах nginx."""
        ticket = await issue_ticket(self.redis, WS_TICKET_PREFIX, user_id, WS_TICKET_TTL)
        return ticket, WS_TICKET_TTL

    async def authenticate_websocket(self, token: str | None, ticket: str | None) -> UsersOrm | None:
        if token:
            return await self.get_user_data_by_token(token)
        user_id = await redeem_ticket(self.redis, WS_TICKET_PREFIX, ticket, one_time=True)
        if not user_id:
            return None
        return await self.repo.get_user_by_id(user_id)

    async def get_user_data_by_token(self, access_token: str) -> UsersOrm | None:
        payload = await self.jwt_manager.verify_token(access_token)
        return await self.repo.get_user_by_id(uuid.UUID(payload.sub))

    async def revoke_token(self, token: str) -> None:
        # Best-effort: невалидный или истёкший токен и так не даст доступа,
        # ошибка здесь не должна ломать выход из аккаунта (куки всё равно
        # надо очистить). Истёкший refresh — самый частый повод для logout.
        try:
            await self.jwt_manager.revoke_token(token)
        except TokenInvalidError:
            pass

    async def refresh_access_token(self, refresh_token: str) -> TokenPair | None:
        try: payload = await self.jwt_manager.verify_token(refresh_token, expected_type=TokenType.REFRESH)
        except TokenInvalidError: raise InvalidTokenError()
        user = await self.repo.get_user_by_id(uuid.UUID(payload.sub))
        if not user:
            raise UserNotFoundError()
        return await self.jwt_manager.refresh_access_token(refresh_token=refresh_token)

    async def search_users(self, search_text: str | None, limit: int = 10, offset: int = 0) -> list[UserShortResponse]:
        users = await self.repo.search(search_text, limit=limit, offset=offset)
        return await self._with_presence(users)

    async def list_directory(self, limit: int, offset: int) -> list[UserShortResponse]:
        """Все, кто есть в Dragram, по алфавиту.

        Раньше список отдавался только по поиску от трёх букв — чтобы одним
        запросом нельзя было выгрузить телефонную книгу сервиса. Номера отсюда
        и так убраны (UserShortResponse их не содержит), а сам сервис закрыт
        дверью и рассчитан на несколько десятков родственников: прятать от них
        друг друга незачем, а «наберите три буквы» — главная причина, по которой
        личный чат оказался самой спрятанной функцией приложения.
        """
        users = await self.repo.list_all(limit=limit, offset=offset)
        return await self._with_presence(users)

    async def _with_presence(self, users: list[UsersOrm]) -> list[UserShortResponse]:
        if not users:
            return []
        keys = [online_key(u.id) for u in users] + [last_seen_key(u.id) for u in users]
        values = await self.redis.mget(keys)
        online_flags, seen_values = values[:len(users)], values[len(users):]
        results = []
        for u, online, seen in zip(users, online_flags, seen_values):
            response = UserShortResponse.model_validate(u)
            response.is_active = online is not None
            response.last_seen = parse_last_seen(seen) or u.last_seen
            results.append(response)
        return results

    async def set_key_backup(self, user_id: uuid.UUID, backup: str) -> None:
        await self.repo.set_key_backup(user_id, backup)
        await self.repo.commit()

    async def get_key_backup(self, user_id: uuid.UUID) -> str | None:
        return await self.repo.get_key_backup(user_id)

    async def rotate_keys(
        self, user_id: uuid.UUID, password: str, public_key: str, key_backup: str
    ) -> None:
        """Смена ключевой пары E2EE.

        Пароль спрашиваем ещё раз: подменить чужой публичный ключ — это ровно
        то, ради чего обычная запись разрешена только один раз, и одного
        украденного access-токена для такой операции быть не должно.

        Последствия необратимы и целиком на стороне клиента: переписка,
        зашифрованная прежним ключом, новым не расшифруется. Клиент
        предупреждает об этом до вызова.
        """
        user = await self.repo.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError()
        ok = await asyncio.to_thread(verify_password, password, user.password_hash)
        if not ok:
            logger.warning("Key rotation refused, wrong password: user_id=%s", user_id)
            raise InvalidCredentials()

        await self.repo.rotate_keys(user_id, public_key, key_backup)
        await self.repo.commit()
        # Событие безопасности: собеседники увидят «ключ изменился», и в
        # журнале должно быть с чем это сопоставить.
        logger.warning("E2EE keys rotated: user_id=%s", user_id)

    async def delete_account(self, user_id: uuid.UUID, password: str, s3) -> None:
        """Удаление аккаунта со всеми данными.

        Пароль спрашиваем ещё раз: операция необратима, и одного украденного
        токена для неё быть не должно. Файлы из хранилища подчищаются
        best-effort — оставить мусор в бакете не страшно, а прервать удаление
        из-за сбоя в S3 было бы неправильно.
        """
        user = await self.repo.get_user_by_id(user_id)
        if not user:
            raise UserNotFoundError()
        ok = await asyncio.to_thread(verify_password, password, user.password_hash)
        if not ok:
            logger.warning("Account deletion refused, wrong password: user_id=%s", user_id)
            raise InvalidCredentials()

        orphaned = await self.repo.delete_user(user_id)
        await self.repo.commit()
        logger.info("Account deleted: user_id=%s, orphaned_files=%s", user_id, len(orphaned))

        await self.revoke_all_sessions(user_id)
        for url in orphaned:
            await s3.delete_file(url)

    async def update_profile(self, user_id: uuid.UUID, form: UpdateProfileForm) -> None:
        await self.repo.update_profile(user_id, form)
        await self.repo.commit()

    async def upload_avatar(self, user_id: uuid.UUID, file, s3) -> str:
        previous = await self.repo.get_avatar_url(user_id)
        url = await s3.upload_file(file.file, file.content_type)
        await self.repo.update_avatar(user_id, url)
        await self.repo.commit()
        # Старый аватар удаляем только после коммита: сорвись запись в БД
        # раньше — пользователь остался бы со ссылкой на удалённый файл.
        # Само удаление best-effort, как и в delete_file: не смогли — в лог,
        # но смену аватара это ломать не должно.
        if previous and previous != url:
            await s3.delete_file(previous)
        return url

    async def set_public_key(self, user_id: uuid.UUID, public_key: str) -> None:
        # Журнал событий безопасности: смена ключа — как раз то, что должно
        # быть видно постфактум, если с перепиской что-то не так.
        logger.info("Public key set: user_id=%s", user_id)
        await self.repo.set_public_key(user_id, public_key)
        await self.repo.commit()

    async def get_public_key(self, user_id: uuid.UUID) -> str | None:
        return await self.repo.get_public_key(user_id)

    async def set_user_online(self, user_id: uuid.UUID) -> None:
        async def persist(moment) -> None:
            # Не критично: не записалось — останется отметка в Redis.
            try:
                await self.repo.set_last_seen(user_id, moment)
                await self.repo.commit()
            except Exception:
                logger.warning("Не удалось сохранить last_seen: user_id=%s", user_id, exc_info=True)

        await touch_presence(self.redis, user_id, persist=persist)




