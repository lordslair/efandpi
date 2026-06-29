import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import * as api from "../api/client";
import BarcodeScanner from "../components/BarcodeScanner";
import ManualImportModal from "../components/ManualImportModal";
import ItemCard from "../components/ItemCard";
import ExportButton from "../components/ExportButton";

interface ScanConfirm {
  barcode: string;
  name: string;
  thumbnail_url: string | null;
  found: boolean;
}

export default function LocationPage() {
  const { id } = useParams<{ id: string }>();
  const locationId = Number(id);
  const navigate = useNavigate();
  const routeState = useLocation().state as { name?: string } | null;

  const [locationName, setLocationName] = useState(routeState?.name ?? "Location");
  const [items, setItems] = useState<api.Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [manualImport, setManualImport] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [scanConfirm, setScanConfirm] = useState<ScanConfirm | null>(null);
  const [manualName, setManualName] = useState("");
  const [confirmQty, setConfirmQty] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.getItems(locationId);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Keep location name if we navigated without state (e.g. direct URL)
  useEffect(() => {
    if (!routeState?.name) {
      api.getLocations().then((locs) => {
        const loc = locs.find((l) => l.id === locationId);
        if (loc) setLocationName(loc.name);
      });
    }
  }, [locationId, routeState?.name]);

  async function handleScan(barcode: string) {
    setScanning(false);
    setLookupLoading(true);
    setError(null);
    try {
      const result = await api.lookupBarcode(locationId, barcode);
      setScanConfirm({
        barcode,
        name: result.name ?? "",
        thumbnail_url: result.thumbnail_url,
        found: result.found,
      });
      setManualName(result.name ?? "");
      setConfirmQty(1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleAddItem() {
    if (!scanConfirm) return;
    const name = manualName.trim() || scanConfirm.barcode;
    try {
      const item = await api.addItem(locationId, {
        barcode: scanConfirm.barcode,
        name,
        quantity: confirmQty,
        thumbnail_url: scanConfirm.thumbnail_url,
      });
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === item.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = item;
          return next;
        }
        return [...prev, item];
      });
      setScanConfirm(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    }
  }

  async function handleQuantityChange(item: api.Item, newQty: number) {
    try {
      const updated = await api.updateItemQuantity(locationId, item.id, newQty);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch {
      // silent
    }
  }

  async function handleDelete(itemId: number) {
    await api.deleteItem(locationId, itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }

  function handleItemAdded(item: api.Item) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = item;
        return next;
      }
      return [...prev, item];
    });
  }

  const FALLBACK =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23f3f4f6'/%3E%3Ctext x='40' y='48' font-size='32' text-anchor='middle'%3E🥫%3C/text%3E%3C/svg%3E";

  return (
    <div className="min-h-screen bg-brand-50">
      {/* Header */}
      <header className="bg-brand-600 text-white px-4 py-4 flex items-center gap-3 shadow-md">
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-brand-700 active:scale-90 transition-transform"
          aria-label="Back"
        >
          ←
        </button>
        <h1 className="text-xl font-bold flex-1 truncate">{locationName}</h1>
        <ExportButton targetRef={listRef} locationName={locationName} />
      </header>

      <main className="px-4 py-4 max-w-lg mx-auto">
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setScanning(true)}
            className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-1.5"
            disabled={lookupLoading}
          >
            {lookupLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Looking up…
              </>
            ) : (
              <>📷 Scan Barcode</>
            )}
          </button>

          <button
            onClick={() => setManualImport(true)}
            className="btn-secondary flex-1 py-2.5 text-sm flex items-center justify-center gap-1.5"
            disabled={lookupLoading}
          >
            ✏️ Manual Import
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        {/* Item list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">📭</div>
            <p className="font-medium">This location is empty</p>
            <p className="text-sm mt-1">Scan a barcode or use Manual Import to add your first item</p>
          </div>
        ) : (
          <div ref={listRef} className="space-y-2">
            {/* Export header (visible in exported image) */}
            <div className="px-1 pb-2 border-b border-gray-200 mb-3">
              <h2 className="font-bold text-gray-800">{locationName} inventory</h2>
              <p className="text-xs text-gray-400">{items.length} item{items.length !== 1 ? "s" : ""}</p>
            </div>
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onQuantityChange={(qty) => handleQuantityChange(item, qty)}
                onDelete={() => handleDelete(item.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Barcode scanner overlay */}
      {scanning && (
        <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />
      )}

      {manualImport && (
        <ManualImportModal
          locationId={locationId}
          onClose={() => setManualImport(false)}
          onAdded={handleItemAdded}
        />
      )}

      {/* Scan confirmation modal */}
      {scanConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="card w-full max-w-sm mb-safe">
            <h3 className="text-lg font-semibold mb-3">
              {scanConfirm.found ? "Product found" : "Unknown product"}
            </h3>

            {/* Product preview */}
            <div className="flex gap-3 mb-4">
              <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex-shrink-0">
                <img
                  src={scanConfirm.thumbnail_url ?? FALLBACK}
                  alt=""
                  className="w-full h-full object-contain"
                  onError={(e) => ((e.target as HTMLImageElement).src = FALLBACK)}
                />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 font-mono mb-1">{scanConfirm.barcode}</p>
                <input
                  className="input-field text-sm py-2"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder={scanConfirm.name || "Product name (required)"}
                />
              </div>
            </div>

            {/* Quantity */}
            <div className="flex items-center gap-3 mb-5">
              <span className="text-sm font-medium text-gray-700">Quantity</span>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => setConfirmQty((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 font-bold text-lg
                             flex items-center justify-center active:scale-90 transition-transform"
                  disabled={confirmQty <= 1}
                >
                  −
                </button>
                <span className="w-8 text-center font-bold text-lg tabular-nums">{confirmQty}</span>
                <button
                  onClick={() => setConfirmQty((q) => q + 1)}
                  className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 font-bold text-lg
                             flex items-center justify-center active:scale-90 transition-transform"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setScanConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn-primary flex-1"
                onClick={handleAddItem}
                disabled={!manualName.trim()}
              >
                Add to list
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
