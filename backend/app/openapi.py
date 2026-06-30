"""OpenAPI schema generation and export helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

import yaml
from fastapi.openapi.utils import get_openapi

if TYPE_CHECKING:
    from fastapi import FastAPI

API_DESCRIPTION = """\
EfanDpi inventory API.

Authenticate with `POST /auth/token` (OAuth2 password flow) and pass the JWT as
`Authorization: Bearer <token>` on protected routes.

Public share links are available without authentication via `GET /public/share/{token}`.
"""

OPENAPI_TAGS = [
    {"name": "auth", "description": "Register and sign in"},
    {"name": "locations", "description": "Manage storage locations and share links"},
    {"name": "items", "description": "Manage items within a location"},
    {"name": "public", "description": "Unauthenticated read-only endpoints"},
]


def build_openapi_schema(app: FastAPI) -> dict:
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=API_DESCRIPTION,
        routes=app.routes,
        tags=OPENAPI_TAGS,
    )
    app.openapi_schema = schema
    return schema


def openapi_to_json(schema: dict, *, indent: int = 2) -> str:
    return json.dumps(schema, indent=indent, ensure_ascii=False) + "\n"


def openapi_to_yaml(schema: dict) -> str:
    return yaml.dump(schema, sort_keys=False, allow_unicode=True)


def export_openapi_files(app: FastAPI, output_dir: Path) -> dict[str, Path]:
    """Write openapi.json and openapi.yaml to *output_dir*; return written paths."""
    output_dir.mkdir(parents=True, exist_ok=True)
    schema = build_openapi_schema(app)

    json_path = output_dir / "openapi.json"
    yaml_path = output_dir / "openapi.yaml"

    json_path.write_text(openapi_to_json(schema), encoding="utf-8")
    yaml_path.write_text(openapi_to_yaml(schema), encoding="utf-8")

    return {"json": json_path, "yaml": yaml_path}
