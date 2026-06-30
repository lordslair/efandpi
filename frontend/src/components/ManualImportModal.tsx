import { FormEvent, useState } from "react";
import * as api from "../api/client";

const FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23f3f4f6'/%3E%3Ctext x='40' y='48' font-size='32' text-anchor='middle'%3E🥫%3C/text%3E%3C/svg%3E";

interface ManualImportModalProps {
  locationId: number;
  onClose: () => void;
  onAdded: (item: api.Item) => void;
}

export default function ManualImportModal({
  locationId,
  onClose,
  onAdded,
}: ManualImportModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<api.ProductSearchResult[]>([]);
  const [selected, setSelected] = useState<api.ProductSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setError(null);
    setSelected(null);
    setResults([]);
    setSearched(false);
    try {
      const products = await api.searchProducts(locationId, trimmed);
      setResults(products);
      setSearched(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd() {
    if (!selected) return;
    setAdding(true);
    setError(null);
    try {
      const item = await api.addItem(locationId, {
        barcode: selected.barcode,
        name: selected.name,
        brand: selected.brand,
        quantity: 1,
        thumbnail_url: selected.thumbnail_url,
      });
      onAdded(item);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
      <div className="card w-full max-w-sm mb-safe max-h-[85vh] flex flex-col">
        <h3 className="text-lg font-semibold mb-4">Manual Import</h3>

        <form onSubmit={handleSearch} className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Product name
          </label>
          <input
            autoFocus
            className="input-field mb-3"
            placeholder="e.g. Nutella, pasta, milk…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={searching || !query.trim()}
          >
            {searching ? "Searching…" : "Search Open Food Facts"}
          </button>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-3">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
          {searched && results.length === 0 && !searching && (
            <p className="text-sm text-gray-500 text-center py-6">
              No products found. Try a different name.
            </p>
          )}

          {results.length > 0 && (
            <ul className="space-y-2">
              {results.map((product) => {
                const isSelected = selected?.barcode === product.barcode;
                return (
                  <li key={product.barcode}>
                    <button
                      type="button"
                      onClick={() => setSelected(product)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                        isSelected
                          ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                          : "border-gray-100 bg-white hover:border-brand-200"
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg bg-gray-50 overflow-hidden flex-shrink-0">
                        <img
                          src={product.thumbnail_url ?? FALLBACK}
                          alt=""
                          className="w-full h-full object-contain"
                          onError={(e) =>
                            ((e.target as HTMLImageElement).src = FALLBACK)
                          }
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 leading-snug truncate">
                          {product.name}
                        </p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">
                          {product.barcode}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex gap-2 mt-4 pt-2 border-t border-gray-100">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={adding}>
            Cancel
          </button>
          <button
            className="btn-primary flex-1"
            onClick={handleAdd}
            disabled={!selected || adding}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
