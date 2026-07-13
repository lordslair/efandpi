import { useEffect, useState } from "react";
import * as api from "../api/client";

interface ItemDetailModalProps {
  locationId: number;
  item: api.Item;
  onClose: () => void;
  onUpdated: (item: api.Item) => void;
  onEditPhoto: () => void;
  onDelete: () => void;
}

const FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23f3f4f6'/%3E%3Ctext x='40' y='48' font-size='32' text-anchor='middle'%3E🥫%3C/text%3E%3C/svg%3E";

export default function ItemDetailModal({
  locationId,
  item,
  onClose,
  onUpdated,
  onEditPhoto,
  onDelete,
}: ItemDetailModalProps) {
  const [name, setName] = useState(item.name);
  const [brand, setBrand] = useState(item.brand ?? "");
  const [barcode, setBarcode] = useState(item.barcode);
  const [quantity, setQuantity] = useState(item.quantity);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateLocations, setDuplicateLocations] = useState<api.ItemLocationSummary[]>([]);

  useEffect(() => {
    api
      .getItemLocations(item.barcode, item.id)
      .then(setDuplicateLocations)
      .catch(() => setDuplicateLocations([]));
  }, [item.barcode, item.id]);

  const dirty =
    name.trim() !== item.name ||
    brand.trim() !== (item.brand ?? "") ||
    barcode.trim() !== item.barcode ||
    quantity !== item.quantity;

  async function handleSave() {
    if (!name.trim() || !barcode.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateItem(locationId, item.id, {
        name: name.trim(),
        brand: brand.trim() || null,
        barcode: barcode.trim(),
        quantity,
      });
      onUpdated(updated);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncAll() {
    if (!name.trim() || !barcode.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateItem(locationId, item.id, {
        name: name.trim(),
        brand: brand.trim() || null,
        barcode: barcode.trim(),
        quantity,
        sync: true,
      });
      onUpdated(updated);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sync");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
      <div className="card w-full max-w-sm mb-safe">
        <h3 className="text-lg font-semibold mb-4">Product details</h3>

        <div className="flex gap-3 mb-4">
          <button
            onClick={onEditPhoto}
            className="relative w-16 h-16 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 flex-shrink-0"
            aria-label="Change photo"
          >
            <img
              src={item.custom_image_url ?? item.thumbnail_url ?? FALLBACK}
              alt=""
              className="w-full h-full object-contain"
              onError={(e) => ((e.target as HTMLImageElement).src = FALLBACK)}
            />
            <span className="absolute bottom-0 right-0 w-5 h-5 rounded-tl-lg bg-black/50 text-white flex items-center justify-center text-[10px] leading-none">
              📷
            </span>
          </button>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Quantity</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity((q) => Math.max(0, q - 1))}
                disabled={quantity <= 0}
                className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 font-bold text-lg
                           flex items-center justify-center active:scale-90 transition-transform
                           disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="w-8 text-center font-bold text-lg tabular-nums">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 font-bold text-lg
                           flex items-center justify-center active:scale-90 transition-transform"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input
            className="input-field text-sm py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Product name"
          />
        </div>

        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1">Brand</label>
          <input
            className="input-field text-sm py-2"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Brand (optional)"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1">Barcode</label>
          <input
            className="input-field text-sm py-2 font-mono"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Barcode"
          />
        </div>

        {duplicateLocations.length > 0 && (
          <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3 mb-3">
            <p className="text-xs text-gray-600 mb-2">
              Also in {duplicateLocations.map((l) => l.location_name).join(", ")}
            </p>
            <button
              className="btn-secondary w-full text-sm py-2"
              onClick={handleSyncAll}
              disabled={!name.trim() || !barcode.trim() || saving}
            >
              {saving ? "Syncing…" : "Sync all"}
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-3">
            {error}
          </div>
        )}

        <div className="flex gap-2 mb-2">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-primary flex-1"
            onClick={handleSave}
            disabled={!name.trim() || !barcode.trim() || !dirty || saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <button
          className="w-full text-center text-sm text-red-500 py-2"
          onClick={onDelete}
          disabled={saving}
        >
          Delete this item
        </button>
      </div>
    </div>
  );
}
