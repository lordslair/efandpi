from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .database import init_db
from .openapi import build_openapi_schema, openapi_to_yaml
from .routers import auth, items, locations, public


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="EfanDpi API",
    version="1.0.0",
    description="Inventory tracking API for EfanDpi",
    lifespan=lifespan,
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)


def custom_openapi():
    return build_openapi_schema(app)


app.openapi = custom_openapi  # type: ignore[method-assign]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(locations.router)
app.include_router(items.router)
app.include_router(public.router)


@app.get("/openapi.yaml", include_in_schema=False)
async def openapi_yaml():
    schema = app.openapi()
    return Response(
        content=openapi_to_yaml(schema),
        media_type="application/yaml",
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
