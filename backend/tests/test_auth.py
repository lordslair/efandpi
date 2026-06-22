import pytest
from httpx import AsyncClient

from app.auth import hash_password, verify_password


def test_hash_and_verify_password():
    hashed = hash_password("my-password")
    assert hashed != "my-password"
    assert verify_password("my-password", hashed)
    assert not verify_password("wrong-password", hashed)


@pytest.mark.asyncio
async def test_register(client: AsyncClient):
    response = await client.post(
        "/auth/register",
        json={"email": "alice@example.com", "password": "pass1234"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "alice@example.com"
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = {"email": "alice@example.com", "password": "pass1234"}
    assert (await client.post("/auth/register", json=payload)).status_code == 201
    response = await client.post("/auth/register", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Email already registered"


@pytest.mark.asyncio
async def test_login(client: AsyncClient):
    email = "bob@example.com"
    password = "pass1234"
    await client.post("/auth/register", json={"email": email, "password": password})

    response = await client.post(
        "/auth/token",
        data={"username": email, "password": password},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    await client.post(
        "/auth/register",
        json={"email": "bob@example.com", "password": "pass1234"},
    )
    response = await client.post(
        "/auth/token",
        data={"username": "bob@example.com", "password": "wrong"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"
