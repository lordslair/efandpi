from typing import Annotated

import openfoodfacts
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import Item, Location, User
from ..schemas import ItemCreate, ItemOut, ItemQuantityUpdate, ProductLookup

router = APIRouter(prefix="/locations/{location_id}/items", tags=["items"])

_off_api = openfoodfacts.API(user_agent="efandpi/1.0")


def _off_field(data: dict, field: str) -> str | None:
    value = data.get(field)
    if value:
        return value
    return (data.get("product") or {}).get(field) or None


async def _get_location_for_user(
    location_id: int,
    current_user: User,
    db: AsyncSession,
) -> Location:
    result = await db.execute(
        select(Location).where(Location.id == location_id, Location.user_id == current_user.id)
    )
    location = result.scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return location


@router.get("/lookup", response_model=ProductLookup)
async def lookup_barcode(
    location_id: int,
    barcode: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _get_location_for_user(location_id, current_user, db)

    try:
        product = _off_api.product.get(
            barcode,
            fields=["code", "product_name", "image_thumb_url"],
        )
    except Exception:
        product = None

    if product and product.get("status") != 0:
        name = _off_field(product, "product_name")
        thumbnail_url = _off_field(product, "image_thumb_url")
        if name or thumbnail_url:
            return ProductLookup(
                barcode=barcode,
                name=name,
                thumbnail_url=thumbnail_url,
                found=True,
            )

    return ProductLookup(barcode=barcode, name=None, thumbnail_url=None, found=False)


@router.get("", response_model=list[ItemOut])
async def list_items(
    location_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _get_location_for_user(location_id, current_user, db)
    result = await db.execute(
        select(Item).where(Item.location_id == location_id).order_by(Item.added_at)
    )
    return result.scalars().all()


@router.post("", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
async def add_item(
    location_id: int,
    payload: ItemCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _get_location_for_user(location_id, current_user, db)

    result = await db.execute(
        select(Item).where(Item.barcode == payload.barcode, Item.location_id == location_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.quantity += payload.quantity
        await db.commit()
        await db.refresh(existing)
        return existing

    item = Item(
        barcode=payload.barcode,
        location_id=location_id,
        name=payload.name,
        quantity=payload.quantity,
        thumbnail_url=payload.thumbnail_url,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=ItemOut)
async def update_item_quantity(
    location_id: int,
    item_id: int,
    payload: ItemQuantityUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _get_location_for_user(location_id, current_user, db)

    result = await db.execute(
        select(Item).where(Item.id == item_id, Item.location_id == location_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if payload.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")

    item.quantity = payload.quantity
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    location_id: int,
    item_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await _get_location_for_user(location_id, current_user, db)

    result = await db.execute(
        select(Item).where(Item.id == item_id, Item.location_id == location_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    await db.delete(item)
    await db.commit()
