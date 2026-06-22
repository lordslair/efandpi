import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_locations_requires_auth(client: AsyncClient):
    response = await client.get("/locations")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_and_list_locations(client: AsyncClient, auth_headers: dict[str, str]):
    create = await client.post(
        "/locations",
        json={"name": "Fridge"},
        headers=auth_headers,
    )
    assert create.status_code == 201
    location = create.json()
    assert location["name"] == "Fridge"

    listing = await client.get("/locations", headers=auth_headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1
    assert listing.json()[0]["id"] == location["id"]


@pytest.mark.asyncio
async def test_delete_location(client: AsyncClient, auth_headers: dict[str, str], location: dict):
    response = await client.delete(f"/locations/{location['id']}", headers=auth_headers)
    assert response.status_code == 204

    listing = await client.get("/locations", headers=auth_headers)
    assert listing.json() == []


@pytest.mark.asyncio
async def test_delete_missing_location(client: AsyncClient, auth_headers: dict[str, str]):
    response = await client.delete("/locations/9999", headers=auth_headers)
    assert response.status_code == 404
