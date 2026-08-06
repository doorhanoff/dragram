import asyncio
import logging
import uuid
from functools import partial
from typing import BinaryIO

import boto3
from botocore.exceptions import ClientError

from .exceptions import InvalidContentType, ProblemWithUploadingFiles
from src.config import settings, ALLOWED_MEDIA_TYPES

logger = logging.getLogger(__name__)

# Единственный префикс, куда приложение вообще что-либо кладёт и откуда
# отдаёт ссылки. Всё остальное в бакете (в том числе бэкапы, если они туда
# когда-нибудь попадут) через приложение недоступно.
UPLOADS_PREFIX = "uploads/"


class S3Service:
    def __init__(self):
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT,
            region_name=settings.S3_REGION,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )
        self.bucket = settings.S3_BUCKET

    async def upload_file(self, file: BinaryIO, content_type: str) -> str:
        # Белый список проверяется здесь, а не только у вызывающих: раньше связь
        # «content_type проверен снаружи» → «расширение и Content-Type объекта
        # безопасны» была неявной, и новый вызов без проверки открыл бы загрузку
        # файла с произвольным типом.
        if content_type not in ALLOWED_MEDIA_TYPES:
            raise InvalidContentType(content_type)
        ext = content_type.split("/")[-1]
        key = f"{UPLOADS_PREFIX}{uuid.uuid4()}.{ext}"

        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(
                None,
                partial(
                    self._client.upload_fileobj,
                    file,
                    self.bucket,
                    key,
                    ExtraArgs={"ContentType": content_type},
                ),
            )
        except ClientError:
            logger.exception("S3 upload failed: key=%s", key)
            raise ProblemWithUploadingFiles()

        return self._build_url(key)

    async def delete_file(self, url: str) -> None:
        # Удаление — best-effort: пользовательское действие (удалить сообщение,
        # заменить аватар) не должно падать из-за сбоя в хранилище. Но и молчать
        # нельзя — иначе осиротевшие файлы копятся незаметно.
        prefix = f"{settings.S3_ENDPOINT}/{self.bucket}/"
        if not url or not url.startswith(prefix):
            logger.warning("S3 delete skipped, url outside current bucket: %s", url)
            return
        key = url.removeprefix(prefix)
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(
                None,
                partial(self._client.delete_object, Bucket=self.bucket, Key=key),
            )
        except ClientError:
            logger.exception("S3 delete failed: key=%s", key)

    def _build_url(self, key: str) -> str:
        return f"{settings.S3_ENDPOINT}/{self.bucket}/{key}"

    def key_from_url(self, url: str) -> str | None:
        """Ключ объекта из сохранённого в БД URL — или None, если URL не наш.
        Используется, чтобы отдать presigned-ссылку только на свои объекты."""
        prefix = f"{settings.S3_ENDPOINT}/{self.bucket}/"
        if not url or not url.startswith(prefix):
            return None
        key = url.removeprefix(prefix)
        return key if self.is_public_key(key) else None

    @staticmethod
    def is_public_key(key: str) -> bool:
        """Отдавать наружу можно только пользовательские загрузки.
        `..` в ключе отсекаем, чтобы `uploads/../backups/x` не прошёл проверку."""
        return key.startswith(UPLOADS_PREFIX) and ".." not in key

    async def generate_presigned_url(self, key: str, expires_in: int | None = None) -> str:
        """Временная ссылка на приватный объект. Бакет закрыт, поэтому это
        единственный способ показать файл в браузере."""
        if not self.is_public_key(key):
            raise ValueError(f"key outside {UPLOADS_PREFIX}")
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            partial(
                self._client.generate_presigned_url,
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=expires_in or settings.MEDIA_LINK_TTL,
            ),
        )


s3_service = S3Service()

