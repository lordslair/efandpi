import hashlib
import os

import boto3
from botocore.client import Config
from fastapi import HTTPException, UploadFile, status

S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL")
S3_BUCKET = os.getenv("S3_BUCKET")
S3_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID")
S3_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY")
S3_REGION = os.getenv("S3_REGION")
S3_PUBLIC_BASE_URL = os.getenv("S3_PUBLIC_BASE_URL")

_ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
_MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB

_s3_client = None


def _get_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT_URL,
            aws_access_key_id=S3_ACCESS_KEY_ID,
            aws_secret_access_key=S3_SECRET_ACCESS_KEY,
            region_name=S3_REGION,
            config=Config(s3={"addressing_style": "path"}),
        )
    return _s3_client


def _object_key(user_email: str, barcode: str, ext: str) -> str:
    folder = hashlib.sha256(user_email.encode("utf-8")).hexdigest()
    return f"{folder}/{barcode}.{ext}"


def _public_url(key: str) -> str:
    if S3_PUBLIC_BASE_URL:
        return f"{S3_PUBLIC_BASE_URL.rstrip('/')}/{key}"
    return f"{S3_ENDPOINT_URL.rstrip('/')}/{S3_BUCKET}/{key}"


def _key_from_url(url: str) -> str | None:
    marker = f"/{S3_BUCKET}/"
    idx = url.find(marker)
    if idx != -1:
        return url[idx + len(marker):]
    if S3_PUBLIC_BASE_URL and url.startswith(S3_PUBLIC_BASE_URL.rstrip("/") + "/"):
        return url[len(S3_PUBLIC_BASE_URL.rstrip("/")) + 1:]
    return None


async def upload_item_image(user_email: str, barcode: str, file: UploadFile) -> str:
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image type. Use JPEG, PNG, or WebP.",
        )

    body = await file.read()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(body) > _MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image too large (max 5 MB).",
        )

    ext = _ALLOWED_CONTENT_TYPES[file.content_type]
    key = _object_key(user_email, barcode, ext)

    client = _get_client()
    try:
        client.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=body,
            ContentType=file.content_type,
            ACL="public-read",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to upload image",
        ) from exc

    return _public_url(key)


def delete_item_image(url: str) -> None:
    """Best-effort delete of a previously uploaded object; never raises."""
    if not url:
        return
    key = _key_from_url(url)
    if not key:
        return
    try:
        _get_client().delete_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        pass
