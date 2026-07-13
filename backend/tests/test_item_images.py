from io import BytesIO
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


async def _add_item(client: AsyncClient, headers: dict, location_id: int, barcode: str = "1111111111111") -> dict:
    resp = await client.post(
        f"/locations/{location_id}/items",
        json={"barcode": barcode, "name": "Test Item", "quantity": 1},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()


@pytest.mark.asyncio
async def test_upload_image_requires_auth(client: AsyncClient, location: dict):
    resp = await client.post(f"/locations/{location['id']}/items/1/image")
    assert resp.status_code == 401


@pytest.mark.asyncio
@patch("app.routers.items.upload_item_image", new_callable=AsyncMock)
async def test_upload_image_sets_custom_image_url(
    mock_upload: AsyncMock, client: AsyncClient, auth_headers: dict, location: dict
):
    mock_upload.return_value = "https://s3.example.com/bucket/hash/1111111111111.jpg"
    item = await _add_item(client, auth_headers, location["id"])

    resp = await client.post(
        f"/locations/{location['id']}/items/{item['id']}/image",
        headers=auth_headers,
        files={"file": ("photo.jpg", BytesIO(b"fake-bytes"), "image/jpeg")},
    )
    assert resp.status_code == 200
    assert resp.json()["custom_image_url"] == mock_upload.return_value
    mock_upload.assert_awaited_once()


@pytest.mark.asyncio
@patch("app.routers.items.delete_item_image")
@patch("app.routers.items.upload_item_image", new_callable=AsyncMock)
async def test_replacing_a_photo_never_deletes_the_just_uploaded_image(
    mock_upload: AsyncMock, mock_delete, client: AsyncClient, auth_headers: dict, location: dict
):
    # The object key is deterministic (same user + barcode), so the URL only
    # differs by its cache-busting query param between uploads. Replacing a
    # photo must never call delete on that (still-in-use) key.
    mock_upload.side_effect = [
        "https://s3.example.com/bucket/hash/1111111111111.jpg?v=aaaaaaaaaa",
        "https://s3.example.com/bucket/hash/1111111111111.jpg?v=bbbbbbbbbb",
    ]
    item = await _add_item(client, auth_headers, location["id"])

    for _ in range(2):
        resp = await client.post(
            f"/locations/{location['id']}/items/{item['id']}/image",
            headers=auth_headers,
            files={"file": ("photo.jpg", BytesIO(b"x"), "image/jpeg")},
        )
        assert resp.status_code == 200

    mock_delete.assert_not_called()


@pytest.mark.asyncio
async def test_upload_image_missing_item_returns_404(client: AsyncClient, auth_headers: dict, location: dict):
    resp = await client.post(
        f"/locations/{location['id']}/items/999999/image",
        headers=auth_headers,
        files={"file": ("photo.jpg", BytesIO(b"x"), "image/jpeg")},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_upload_image_rejects_other_users_item(client: AsyncClient, auth_headers: dict, location: dict):
    item = await _add_item(client, auth_headers, location["id"])

    await client.post("/auth/register", json={"email": "other@example.com", "password": "secret123"})
    token_resp = await client.post(
        "/auth/token", data={"username": "other@example.com", "password": "secret123"}
    )
    other_headers = {"Authorization": f"Bearer {token_resp.json()['access_token']}"}

    resp = await client.post(
        f"/locations/{location['id']}/items/{item['id']}/image",
        headers=other_headers,
        files={"file": ("photo.jpg", BytesIO(b"x"), "image/jpeg")},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
@patch("app.routers.items.delete_item_image")
@patch("app.routers.items.upload_item_image", new_callable=AsyncMock)
async def test_delete_image_clears_custom_image_url(
    mock_upload: AsyncMock,
    mock_delete,
    client: AsyncClient,
    auth_headers: dict,
    location: dict,
):
    mock_upload.return_value = "https://s3.example.com/bucket/hash/1111111111111.jpg"
    item = await _add_item(client, auth_headers, location["id"])
    await client.post(
        f"/locations/{location['id']}/items/{item['id']}/image",
        headers=auth_headers,
        files={"file": ("photo.jpg", BytesIO(b"x"), "image/jpeg")},
    )

    resp = await client.delete(
        f"/locations/{location['id']}/items/{item['id']}/image",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["custom_image_url"] is None
    mock_delete.assert_called_once_with(mock_upload.return_value)


@pytest.mark.asyncio
async def test_delete_image_noop_when_no_custom_image(client: AsyncClient, auth_headers: dict, location: dict):
    item = await _add_item(client, auth_headers, location["id"])

    resp = await client.delete(
        f"/locations/{location['id']}/items/{item['id']}/image",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["custom_image_url"] is None
