import asyncio
import uuid
from functools import partial
from typing import BinaryIO

import boto3
from botocore.exceptions import ClientError

from src.config import settings

MAX_FILE_SIZE = 25 * 1024 * 1024


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
        ext = content_type.split("/")[-1]
        key = f"uploads/{uuid.uuid4()}.{ext}"

        loop = asyncio.get_event_loop()
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

        return self._build_url(key)

    async def delete_file(self, url: str) -> None:
        prefix = f"{settings.S3_ENDPOINT}/{self.bucket}/"
        if not url or not url.startswith(prefix):
            return
        key = url.removeprefix(prefix)
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(
                None,
                partial(self._client.delete_object, Bucket=self.bucket, Key=key),
            )
        except ClientError:
            pass

    def _build_url(self, key: str) -> str:
        return f"{settings.S3_ENDPOINT}/{self.bucket}/{key}"


s3_service = S3Service()
