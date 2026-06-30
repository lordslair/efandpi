from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Item, LocationShare
from ..schemas import SharedItemOut, SharedLocationOut

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/share/{token}", response_model=SharedLocationOut)
async def get_shared_location(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    share_result = await db.execute(
        select(LocationShare).where(LocationShare.token == token)
    )
    share = share_result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found")

    await db.refresh(share, ["location"])
    location = share.location

    items_result = await db.execute(
        select(Item).where(Item.location_id == location.id).order_by(Item.added_at)
    )
    items = items_result.scalars().all()
    in_stock_items = [item for item in items if item.quantity > 0]

    return SharedLocationOut(
        name=location.name,
        items=[
            SharedItemOut(
                name=item.name,
                brand=item.brand,
                barcode=item.barcode,
                quantity=item.quantity,
                thumbnail_url=item.thumbnail_url,
            )
            for item in in_stock_items
        ],
    )
