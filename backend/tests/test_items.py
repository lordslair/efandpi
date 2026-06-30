from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

from app.routers.items import _off_brand, _off_field


def test_off_field_reads_top_level_and_nested_values():
    assert _off_field({"product_name": "Nutella"}, "product_name") == "Nutella"
    assert _off_field({"product": {"product_name": "Jam"}}, "product_name") == "Jam"
    assert _off_field({}, "product_name") is None


def test_off_brand_reads_brands_and_brand_fields():
    assert _off_brand({"brands": "Ferrero"}) == "Ferrero"
    assert _off_brand({"product": {"brands": "Nestlé"}}) == "Nestlé"
    assert _off_brand({"brand": "Barilla"}) == "Barilla"
    assert _off_brand({}) is None


@pytest.mark.asyncio
async def test_lookup_requires_auth(client: AsyncClient, location: dict):
    response = await client.get(
        f"/locations/{location['id']}/items/lookup",
        params={"barcode": "3017620422003"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
@patch("app.routers.items._off_api")
async def test_lookup_found(
    mock_off_api: MagicMock,
    client: AsyncClient,
    auth_headers: dict[str, str],
    location: dict,
):
    mock_off_api.product.get.return_value = {
        "product_name": "Nutella",
        "brands": "Ferrero",
        "image_thumb_url": "https://example.com/nutella.jpg",
    }

    response = await client.get(
        f"/locations/{location['id']}/items/lookup",
        params={"barcode": "3017620422003"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["found"] is True
    assert data["name"] == "Nutella"
    assert data["brand"] == "Ferrero"
    assert data["barcode"] == "3017620422003"


@pytest.mark.asyncio
@patch("app.routers.items._off_api")
async def test_lookup_not_found(
    mock_off_api: MagicMock,
    client: AsyncClient,
    auth_headers: dict[str, str],
    location: dict,
):
    mock_off_api.product.get.return_value = None

    response = await client.get(
        f"/locations/{location['id']}/items/lookup",
        params={"barcode": "0000000000000"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["found"] is False
    assert data["name"] is None


@pytest.mark.asyncio
async def test_search_requires_auth(client: AsyncClient, location: dict):
    response = await client.get(
        f"/locations/{location['id']}/items/search",
        params={"q": "nutella"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
@patch("app.routers.items._off_api")
async def test_search_empty_query_returns_empty_list(
    mock_off_api: MagicMock,
    client: AsyncClient,
    auth_headers: dict[str, str],
    location: dict,
):
    response = await client.get(
        f"/locations/{location['id']}/items/search",
        params={"q": "   "},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json() == []
    mock_off_api.product.text_search.assert_not_called()


@pytest.mark.asyncio
@patch("app.routers.items._off_api")
async def test_search_returns_products(
    mock_off_api: MagicMock,
    client: AsyncClient,
    auth_headers: dict[str, str],
    location: dict,
):
    mock_off_api.product.text_search.return_value = {
        "products": [
            {
                "code": "3017620422003",
                "product_name": "Nutella",
                "brands": "Ferrero",
                "image_thumb_url": "https://example.com/nutella.jpg",
            },
            {"code": "123", "product_name": ""},
        ]
    }

    response = await client.get(
        f"/locations/{location['id']}/items/search",
        params={"q": "nutella"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["barcode"] == "3017620422003"
    assert data[0]["name"] == "Nutella"
    assert data[0]["brand"] == "Ferrero"


@pytest.mark.asyncio
async def test_add_list_update_and_delete_item(
    client: AsyncClient,
    auth_headers: dict[str, str],
    location: dict,
):
    location_id = location["id"]
    payload = {
        "barcode": "1234567890123",
        "name": "Tomato sauce",
        "brand": "Mutti",
        "quantity": 2,
        "thumbnail_url": "https://example.com/sauce.jpg",
    }

    create = await client.post(
        f"/locations/{location_id}/items",
        json=payload,
        headers=auth_headers,
    )
    assert create.status_code == 201
    item = create.json()
    assert item["name"] == "Tomato sauce"
    assert item["brand"] == "Mutti"
    assert item["quantity"] == 2

    listing = await client.get(f"/locations/{location_id}/items", headers=auth_headers)
    assert len(listing.json()) == 1

    update = await client.patch(
        f"/locations/{location_id}/items/{item['id']}",
        json={"quantity": 5},
        headers=auth_headers,
    )
    assert update.status_code == 200
    assert update.json()["quantity"] == 5

    delete = await client.delete(
        f"/locations/{location_id}/items/{item['id']}",
        headers=auth_headers,
    )
    assert delete.status_code == 204

    listing = await client.get(f"/locations/{location_id}/items", headers=auth_headers)
    assert listing.json() == []


@pytest.mark.asyncio
async def test_add_duplicate_barcode_increments_quantity(
    client: AsyncClient,
    auth_headers: dict[str, str],
    location: dict,
):
    location_id = location["id"]
    payload = {"barcode": "9998887776665", "name": "Pasta", "quantity": 2}

    first = await client.post(
        f"/locations/{location_id}/items",
        json=payload,
        headers=auth_headers,
    )
    assert first.status_code == 201

    second = await client.post(
        f"/locations/{location_id}/items",
        json={**payload, "quantity": 3},
        headers=auth_headers,
    )
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["quantity"] == 5


@pytest.mark.asyncio
async def test_update_quantity_can_be_zero(
    client: AsyncClient,
    auth_headers: dict[str, str],
    location: dict,
):
    location_id = location["id"]
    create = await client.post(
        f"/locations/{location_id}/items",
        json={"barcode": "1112223334445", "name": "Rice", "quantity": 1},
        headers=auth_headers,
    )
    item_id = create.json()["id"]

    response = await client.patch(
        f"/locations/{location_id}/items/{item_id}",
        json={"quantity": 0},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["quantity"] == 0


@pytest.mark.asyncio
async def test_update_quantity_cannot_be_negative(
    client: AsyncClient,
    auth_headers: dict[str, str],
    location: dict,
):
    location_id = location["id"]
    create = await client.post(
        f"/locations/{location_id}/items",
        json={"barcode": "1112223334445", "name": "Rice", "quantity": 1},
        headers=auth_headers,
    )
    item_id = create.json()["id"]

    response = await client.patch(
        f"/locations/{location_id}/items/{item_id}",
        json={"quantity": -1},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Quantity must be at least 0"
