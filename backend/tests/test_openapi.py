import json
from pathlib import Path

import pytest
import yaml
from httpx import AsyncClient

from app.main import app
from app.openapi import export_openapi_files, openapi_to_json, openapi_to_yaml


@pytest.mark.asyncio
async def test_openapi_json_endpoint(client: AsyncClient):
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")

    schema = response.json()
    assert schema["openapi"].startswith("3.")
    assert schema["info"]["title"] == "EfanDpi API"
    assert "/health" in schema["paths"]
    assert "/public/share/{token}" in schema["paths"]


@pytest.mark.asyncio
async def test_openapi_yaml_endpoint(client: AsyncClient):
    response = await client.get("/openapi.yaml")
    assert response.status_code == 200
    assert "yaml" in response.headers["content-type"]

    schema = yaml.safe_load(response.text)
    assert schema["info"]["title"] == "EfanDpi API"
    assert "/locations/{location_id}/share" in schema["paths"]


def test_openapi_helpers_match():
    schema = app.openapi()
    parsed_json = json.loads(openapi_to_json(schema))
    parsed_yaml = yaml.safe_load(openapi_to_yaml(schema))
    assert parsed_json == parsed_yaml


def test_export_openapi_files(tmp_path: Path):
    paths = export_openapi_files(app, tmp_path)

    assert paths["json"].is_file()
    assert paths["yaml"].is_file()

    json_schema = json.loads(paths["json"].read_text(encoding="utf-8"))
    yaml_schema = yaml.safe_load(paths["yaml"].read_text(encoding="utf-8"))
    assert json_schema == yaml_schema
    assert "/auth/token" in json_schema["paths"]
