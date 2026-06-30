from datetime import datetime
from pydantic import BaseModel, EmailStr


# Auth
class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str


# Locations
class LocationCreate(BaseModel):
    name: str


class LocationOut(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# Items
class ItemCreate(BaseModel):
    barcode: str
    name: str
    quantity: int = 1
    thumbnail_url: str | None = None


class ItemQuantityUpdate(BaseModel):
    quantity: int


class ItemOut(BaseModel):
    id: int
    barcode: str
    name: str
    quantity: int
    thumbnail_url: str | None
    added_at: datetime

    model_config = {"from_attributes": True}


# Open Food Facts lookup result
class ProductLookup(BaseModel):
    barcode: str
    name: str | None
    thumbnail_url: str | None
    found: bool


class ProductSearchResult(BaseModel):
    barcode: str
    name: str
    thumbnail_url: str | None


# Share links
class ShareLinkOut(BaseModel):
    token: str


class SharedItemOut(BaseModel):
    name: str
    barcode: str
    quantity: int
    thumbnail_url: str | None


class SharedLocationOut(BaseModel):
    name: str
    items: list[SharedItemOut]
