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
    brand: str | None = None
    quantity: int = 1
    thumbnail_url: str | None = None


class ItemUpdate(BaseModel):
    name: str | None = None
    brand: str | None = None
    barcode: str | None = None
    quantity: int | None = None
    sync: bool = False


class ItemOut(BaseModel):
    id: int
    barcode: str
    name: str
    brand: str | None
    quantity: int
    thumbnail_url: str | None
    custom_image_url: str | None
    added_at: datetime

    model_config = {"from_attributes": True}


class ItemLocationSummary(BaseModel):
    location_id: int
    location_name: str


# Open Food Facts lookup result
class ProductLookup(BaseModel):
    barcode: str
    name: str | None
    brand: str | None
    thumbnail_url: str | None
    found: bool


class ProductSearchResult(BaseModel):
    barcode: str
    name: str
    brand: str | None
    thumbnail_url: str | None


# Share links
class ShareLinkOut(BaseModel):
    token: str


class SharedItemOut(BaseModel):
    name: str
    brand: str | None
    barcode: str
    quantity: int
    thumbnail_url: str | None
    custom_image_url: str | None


class SharedLocationOut(BaseModel):
    name: str
    items: list[SharedItemOut]
