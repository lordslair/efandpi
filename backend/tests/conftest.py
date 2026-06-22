import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest")

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base, engine
from app.main import app

TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "secret123"


@pytest.fixture(autouse=True)
async def fresh_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    response = await client.post(
        "/auth/register",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert response.status_code == 201

    response = await client.post(
        "/auth/token",
        data={"username": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def location(client: AsyncClient, auth_headers: dict[str, str]) -> dict:
    response = await client.post(
        "/locations",
        json={"name": "Pantry"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    return response.json()
