#!/usr/bin/env python3
"""Export the FastAPI OpenAPI schema to openapi.json and openapi.yaml."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow `python scripts/export_openapi.py` from the backend directory.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app  # noqa: E402
from app.openapi import export_openapi_files  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Export the EfanDpi OpenAPI schema to JSON and YAML files."
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=BACKEND_ROOT,
        help="Directory to write openapi.json and openapi.yaml (default: backend/)",
    )
    args = parser.parse_args()

    paths = export_openapi_files(app, args.output_dir)
    print(f"Wrote {paths['json']}")
    print(f"Wrote {paths['yaml']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
