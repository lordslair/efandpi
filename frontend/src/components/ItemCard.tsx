import { Item } from "../api/client";

interface ItemCardProps {
  item: {
    name: string;
    brand?: string | null;
    barcode: string;
    quantity: number;
    thumbnail_url?: string | null;
    custom_image_url?: string | null;
  };
  readOnly?: boolean;
  outOfStock?: boolean;
  onQuantityChange?: (newQty: number) => void;
  onDelete?: () => void;
  onEditPhoto?: () => void;
  onOpenDetail?: () => void;
}

const FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23f3f4f6'/%3E%3Ctext x='40' y='48' font-size='32' text-anchor='middle'%3E🥫%3C/text%3E%3C/svg%3E";

export default function ItemCard({
  item,
  readOnly = false,
  outOfStock = false,
  onQuantityChange,
  onDelete,
  onEditPhoto,
  onOpenDetail,
}: ItemCardProps) {
  const clickable = !readOnly && !!onOpenDetail;
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${
        outOfStock
          ? "bg-gray-100 border-gray-200"
          : "bg-white border-gray-100"
      }`}
    >
      {/* Thumbnail */}
      <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0">
        <img
          src={item.custom_image_url ?? item.thumbnail_url ?? FALLBACK}
          alt={item.name}
          className="w-full h-full object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).src = FALLBACK;
          }}
        />
        {!readOnly && onEditPhoto && (
          <button
            onClick={onEditPhoto}
            className="absolute bottom-0 right-0 w-5 h-5 rounded-tl-lg bg-black/50 text-white
                       flex items-center justify-center text-[10px] leading-none"
            aria-label="Edit photo"
          >
            📷
          </button>
        )}
      </div>

      {/* Name + brand + barcode */}
      {clickable ? (
        <button
          onClick={onOpenDetail}
          className="flex-1 min-w-0 text-left"
          aria-label="View product details"
        >
          <p className="font-semibold text-gray-900 text-sm leading-snug truncate">{item.name}</p>
          {item.brand && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{item.brand}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5 font-mono">{item.barcode}</p>
        </button>
      ) : (
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-snug truncate">{item.name}</p>
          {item.brand && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{item.brand}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5 font-mono">{item.barcode}</p>
        </div>
      )}

      {readOnly ? (
        <span className="w-8 text-center font-bold text-gray-800 text-base tabular-nums flex-shrink-0">
          {item.quantity}
        </span>
      ) : (
        <>
          {/* Quantity controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => onQuantityChange?.(item.quantity - 1)}
              disabled={item.quantity <= 0}
              className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-bold text-lg
                         flex items-center justify-center active:scale-90 transition-transform
                         disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-8 text-center font-bold text-gray-800 text-base tabular-nums">
              {item.quantity}
            </span>
            <button
              onClick={() => onQuantityChange?.(item.quantity + 1)}
              className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-bold text-lg
                         flex items-center justify-center active:scale-90 transition-transform"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          {/* Delete */}
          <button
            onClick={onDelete}
            className="w-8 h-8 rounded-full bg-red-50 text-red-400 hover:bg-red-100
                       flex items-center justify-center text-sm active:scale-90 transition-transform
                       flex-shrink-0"
            aria-label="Delete item"
          >
            🗑️
          </button>
        </>
      )}
    </div>
  );
}

export type { Item };
