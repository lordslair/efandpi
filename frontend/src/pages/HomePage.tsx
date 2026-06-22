import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import * as api from "../api/client";

const LOCATION_ICONS: Record<string, string> = {
  fridge: "🧊",
  freezer: "❄️",
  pantry: "🥫",
  cellar: "🍷",
  cupboard: "🚪",
  garage: "🔧",
};

function getIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(LOCATION_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return "📦";
}

export default function HomePage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [locations, setLocations] = useState<api.Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const fetchLocations = useCallback(async () => {
    try {
      const data = await api.getLocations();
      setLocations(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  async function handleAdd() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const loc = await api.createLocation(newName.trim());
      setLocations((prev) => [...prev, loc]);
      setNewName("");
      setShowAdd(false);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    await api.deleteLocation(id);
    setLocations((prev) => prev.filter((l) => l.id !== id));
    setDeleteConfirm(null);
  }

  return (
    <div className="min-h-screen bg-brand-50">
      {/* Header */}
      <header className="bg-brand-600 text-white px-4 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧊</span>
          <h1 className="text-xl font-bold tracking-tight">EfanDpi</h1>
        </div>
        <button
          onClick={logout}
          className="text-sm text-brand-100 hover:text-white transition-colors px-3 py-1 rounded-lg hover:bg-brand-700"
        >
          Sign out
        </button>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">My Locations</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="btn-primary flex items-center gap-1.5 py-2 text-sm"
          >
            <span className="text-lg leading-none">+</span> Add
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : locations.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-3">📦</div>
            <p className="font-medium">No locations yet</p>
            <p className="text-sm mt-1">Tap "Add" to create your first storage location</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {locations.map((loc) => (
              <div key={loc.id} className="relative group">
                <button
                  onClick={() => navigate(`/location/${loc.id}`, { state: { name: loc.name } })}
                  className="card w-full text-left flex flex-col items-center justify-center py-8 gap-2
                             hover:border-brand-300 hover:shadow-md transition-all active:scale-95"
                >
                  <span className="text-4xl">{getIcon(loc.name)}</span>
                  <span className="font-semibold text-gray-800 text-center leading-tight">
                    {loc.name}
                  </span>
                </button>
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(loc.id);
                  }}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gray-100 text-gray-400
                             hover:bg-red-100 hover:text-red-500 flex items-center justify-center
                             text-xs transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Delete location"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Location Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
          <div className="card w-full max-w-sm mb-safe">
            <h3 className="text-lg font-semibold mb-4">New Location</h3>
            <input
              autoFocus
              className="input-field mb-4"
              placeholder="e.g. Fridge, Pantry, Cellar…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button
                className="btn-primary flex-1"
                onClick={handleAdd}
                disabled={adding || !newName.trim()}
              >
                {adding ? "Adding…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-xs text-center">
            <div className="text-3xl mb-2">🗑️</div>
            <h3 className="text-lg font-semibold mb-1">Delete location?</h3>
            <p className="text-sm text-gray-500 mb-5">
              All items in this location will be permanently removed.
            </p>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn-danger flex-1" onClick={() => handleDelete(deleteConfirm)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
