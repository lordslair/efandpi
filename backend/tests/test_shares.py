import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_share_requires_auth(client: AsyncClient, location: dict):
    response = await client.post(f"/locations/{location['id']}/share")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_regenerate_requires_auth(client: AsyncClient, location: dict):
    response = await client.post(f"/locations/{location['id']}/share/regenerate")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_share_link(
    client: AsyncClient, auth_headers: dict[str, str], location: dict
):
    response = await client.post(
        f"/locations/{location['id']}/share", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert len(data["token"]) == 36  # UUID4


@pytest.mark.asyncio
async def test_create_share_link_is_idempotent(
    client: AsyncClient, auth_headers: dict[str, str], location: dict
):
    r1 = await client.post(f"/locations/{location['id']}/share", headers=auth_headers)
    r2 = await client.post(f"/locations/{location['id']}/share", headers=auth_headers)
    assert r1.json()["token"] == r2.json()["token"]


@pytest.mark.asyncio
async def test_regenerate_changes_token(
    client: AsyncClient, auth_headers: dict[str, str], location: dict
):
    r1 = await client.post(f"/locations/{location['id']}/share", headers=auth_headers)
    old_token = r1.json()["token"]

    r2 = await client.post(
        f"/locations/{location['id']}/share/regenerate", headers=auth_headers
    )
    new_token = r2.json()["token"]

    assert new_token != old_token
    assert len(new_token) == 36


@pytest.mark.asyncio
async def test_old_token_returns_404_after_regenerate(
    client: AsyncClient, auth_headers: dict[str, str], location: dict
):
    r1 = await client.post(f"/locations/{location['id']}/share", headers=auth_headers)
    old_token = r1.json()["token"]

    await client.post(
        f"/locations/{location['id']}/share/regenerate", headers=auth_headers
    )

    response = await client.get(f"/public/share/{old_token}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_public_share_returns_items_without_auth(
    client: AsyncClient, auth_headers: dict[str, str], location: dict
):
    await client.post(
        f"/locations/{location['id']}/items",
        json={"barcode": "1234567890", "name": "Butter", "quantity": 3},
        headers=auth_headers,
    )

    share = await client.post(
        f"/locations/{location['id']}/share", headers=auth_headers
    )
    token = share.json()["token"]

    response = await client.get(f"/public/share/{token}")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Pantry"
    assert len(data["items"]) == 1
    assert data["items"][0]["name"] == "Butter"
    assert data["items"][0]["quantity"] == 3
    assert "id" not in data["items"][0]


@pytest.mark.asyncio
async def test_invalid_token_returns_404(client: AsyncClient):
    response = await client.get("/public/share/nonexistent-token")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_location_removes_share(
    client: AsyncClient, auth_headers: dict[str, str], location: dict
):
    share = await client.post(
        f"/locations/{location['id']}/share", headers=auth_headers
    )
    token = share.json()["token"]

    await client.delete(f"/locations/{location['id']}", headers=auth_headers)

    response = await client.get(f"/public/share/{token}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_share_own_location_only(
    client: AsyncClient, auth_headers: dict[str, str]
):
    other_loc = await client.post(
        "/locations",
        json={"name": "Other"},
        headers=auth_headers,
    )
    other_id = other_loc.json()["id"]

    # Second user tries to share the first user's location
    await client.post(
        "/auth/register", json={"email": "other@example.com", "password": "pass123"}
    )
    login = await client.post(
        "/auth/token",
        data={"username": "other@example.com", "password": "pass123"},
    )
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    response = await client.post(f"/locations/{other_id}/share", headers=other_headers)
    assert response.status_code == 404
