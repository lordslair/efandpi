from typing import Annotated

import openfoodfacts
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import get_current_user
from ..database import get_db
from ..models import Item, Location, User
from ..schemas import ItemCreate, ItemOut, ItemUpdate, ProductLookup, ProductSearchResult
from ..storage import delete_item_image, upload_item_image

router = APIRouter(prefix="/locations/{location_id}/items", tags=["items"])

_off_api = openfoodfacts.API(user_agent="efandpi/1.0")


def _off_field(data: dict, field: str) -> str | None:
    value = data.get(field)
    if value:
        return value
    return (data.get("product") or {}).get(field) or None


def _off_brand(data: dict) -> str | None:
    for field in ("brands", "brand"):
        value = _off_field(data, field)
        if value:
            return value.strip()
    return None


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
            fields=["code", "product_name", "brands", "brand", "image_thumb_url"],
        )
    except Exception:
        product = None

    if product and product.get("status") != 0:
        name = _off_field(product, "product_name")
        brand = _off_brand(product)
        thumbnail_url = _off_field(product, "image_thumb_url")
        if name or brand or thumbnail_url:
            return ProductLookup(
                barcode=barcode,
                name=name,
                brand=brand,
                thumbnail_url=thumbnail_url,
                found=True,
            )

    return ProductLookup(barcode=barcode, name=None, brand=None, thumbnail_url=None, found=False)


@router.get("/search", response_model=list[ProductSearchResult])
async def search_products(
    location_id: int,
    q: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page_size: int = 20,
):
    await _get_location_for_user(location_id, current_user, db)

    query = q.strip()
    if not query:
        return []

    try:
        data = _off_api.product.text_search(query, page_size=min(page_size, 24))
    except Exception:
        raise HTTPException(status_code=502, detail="Product search unavailable")

    results: list[ProductSearchResult] = []
    for product in data.get("products") or []:
        barcode = product.get("code") or _off_field(product, "code")
        name = _off_field(product, "product_name")
        if not barcode or not name:
            continue
        results.append(
            ProductSearchResult(
                barcode=str(barcode),
                name=name,
                brand=_off_brand(product),
                thumbnail_url=_off_field(product, "image_thumb_url"),
            )
        )
    return results


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
        brand=payload.brand,
        quantity=payload.quantity,
        thumbnail_url=payload.thumbnail_url,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/{item_id}", response_model=ItemOut)
async def update_item(
    location_id: int,
    item_id: int,
    payload: ItemUpdate,
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

    if payload.quantity is not None:
        if payload.quantity < 0:
            raise HTTPException(status_code=400, detail="Quantity must be at least 0")
        item.quantity = payload.quantity

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        item.name = name

    if payload.brand is not None:
        item.brand = payload.brand.strip() or None

    if payload.barcode is not None:
        barcode = payload.barcode.strip()
        if not barcode:
            raise HTTPException(status_code=400, detail="Barcode cannot be empty")
        if barcode != item.barcode:
            dup = await db.execute(
                select(Item).where(
                    Item.barcode == barcode,
                    Item.location_id == location_id,
                    Item.id != item_id,
                )
            )
            if dup.scalar_one_or_none():
                raise HTTPException(
                    status_code=409, detail="Another item with this barcode already exists"
                )
            item.barcode = barcode

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


@router.post("/{item_id}/image", response_model=ItemOut)
async def upload_item_photo(
    location_id: int,
    item_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    await _get_location_for_user(location_id, current_user, db)

    result = await db.execute(
        select(Item).where(Item.id == item_id, Item.location_id == location_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # The object key is deterministic per item, so put_object() above always
    # overwrites the same object in place — no separate delete of the "old"
    # image is needed (and the old/new URLs now differ only by a cache-busting
    # query param, so comparing them would incorrectly look like a new key).
    item.custom_image_url = await upload_item_image(current_user.email, item.barcode, file)
    await db.commit()
    await db.refresh(item)

    return item


@router.delete("/{item_id}/image", response_model=ItemOut)
async def delete_item_photo(
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

    if item.custom_image_url:
        delete_item_image(item.custom_image_url)
        item.custom_image_url = None
        await db.commit()
        await db.refresh(item)

    return item
