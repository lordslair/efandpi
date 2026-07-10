import hashlib
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app import storage


def _upload_file(content: bytes, content_type: str, filename: str = "photo") -> UploadFile:
    return UploadFile(
        file=BytesIO(content),
        filename=filename,
        headers=Headers({"content-type": content_type}),
    )


def test_object_key_uses_sha256_email_and_barcode():
    key = storage._object_key("user@example.com", "1234567890123", "jpg")
    expected_folder = hashlib.sha256(b"user@example.com").hexdigest()
    assert key == f"{expected_folder}/1234567890123.jpg"


def test_public_url_uses_virtual_hosted_style_by_default():
    with patch.object(storage, "S3_ENDPOINT_URL", "https://s3.gra.io.cloud.ovh.net"), patch.object(
        storage, "S3_BUCKET", "efandpi"
    ), patch.object(storage, "S3_PUBLIC_BASE_URL", None):
        assert (
            storage._public_url("abc/1.jpg")
            == "https://efandpi.s3.gra.io.cloud.ovh.net/abc/1.jpg"
        )


def test_public_url_prefers_public_base_url_override():
    with patch.object(storage, "S3_PUBLIC_BASE_URL", "https://cdn.example.com/"):
        assert storage._public_url("abc/1.jpg") == "https://cdn.example.com/abc/1.jpg"


@pytest.mark.asyncio
async def test_upload_item_image_rejects_bad_content_type():
    file = _upload_file(b"data", "image/gif")
    with pytest.raises(HTTPException) as exc:
        await storage.upload_item_image("u@example.com", "123", file)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_upload_item_image_rejects_empty_file():
    file = _upload_file(b"", "image/jpeg")
    with pytest.raises(HTTPException) as exc:
        await storage.upload_item_image("u@example.com", "123", file)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_upload_item_image_rejects_oversized_file():
    file = _upload_file(b"x" * (storage._MAX_UPLOAD_BYTES + 1), "image/jpeg")
    with pytest.raises(HTTPException) as exc:
        await storage.upload_item_image("u@example.com", "123", file)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_upload_item_image_uploads_and_returns_public_url():
    file = _upload_file(b"fake-bytes", "image/jpeg")

    mock_client = MagicMock()
    with patch.object(storage, "_get_client", return_value=mock_client), patch.object(
        storage, "S3_ENDPOINT_URL", "https://s3.gra.io.cloud.ovh.net"
    ), patch.object(storage, "S3_BUCKET", "efandpi"), patch.object(
        storage, "S3_PUBLIC_BASE_URL", None
    ):
        url = await storage.upload_item_image("user@example.com", "1234567890123", file)

    mock_client.put_object.assert_called_once()
    call_kwargs = mock_client.put_object.call_args.kwargs
    assert call_kwargs["Bucket"] == "efandpi"
    assert call_kwargs["Body"] == b"fake-bytes"
    expected_folder = hashlib.sha256(b"user@example.com").hexdigest()
    assert call_kwargs["Key"] == f"{expected_folder}/1234567890123.jpg"
    assert url == f"https://efandpi.s3.gra.io.cloud.ovh.net/{expected_folder}/1234567890123.jpg"


def test_delete_item_image_parses_virtual_hosted_style_url():
    mock_client = MagicMock()
    with patch.object(storage, "_get_client", return_value=mock_client), patch.object(
        storage, "S3_ENDPOINT_URL", "https://s3.gra.io.cloud.ovh.net"
    ), patch.object(storage, "S3_BUCKET", "efandpi"):
        storage.delete_item_image("https://efandpi.s3.gra.io.cloud.ovh.net/abc/1.jpg")
    mock_client.delete_object.assert_called_once_with(Bucket="efandpi", Key="abc/1.jpg")


def test_delete_item_image_falls_back_to_legacy_path_style_url():
    """URLs stored before the virtual-hosted-style change must still resolve."""
    mock_client = MagicMock()
    mock_client.delete_object.side_effect = Exception("boom")
    with patch.object(storage, "_get_client", return_value=mock_client), patch.object(
        storage, "S3_ENDPOINT_URL", "https://s3.gra.io.cloud.ovh.net"
    ), patch.object(storage, "S3_BUCKET", "my-bucket"):
        storage.delete_item_image("https://s3.example.com/my-bucket/abc/1.jpg")
    mock_client.delete_object.assert_called_once_with(Bucket="my-bucket", Key="abc/1.jpg")


def test_delete_item_image_noop_for_empty_url():
    mock_client = MagicMock()
    with patch.object(storage, "_get_client", return_value=mock_client):
        storage.delete_item_image("")
    mock_client.delete_object.assert_not_called()
