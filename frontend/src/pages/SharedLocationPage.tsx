import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import * as api from "../api/client";
import ItemCard from "../components/ItemCard";

export default function SharedLocationPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<api.SharedLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .getSharedLocation(token)
      .then(setData)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("Not found") || msg.includes("404")) {
          setNotFound(true);
        } else {
          setNotFound(true);
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3">
        <p className="text-4xl">🔗</p>
        <h1 className="text-xl font-bold text-gray-800">Link not found</h1>
        <p className="text-gray-500 text-sm text-center max-w-xs">
          This share link may have been regenerated or the location was deleted.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-0.5">
            Shared inventory
          </p>
          <h1 className="text-xl font-bold text-gray-900">{data.name}</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {data.items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-gray-500">This location is empty.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.items.map((item, idx) => (
              <li key={`${item.barcode}-${idx}`}>
                <ItemCard item={item} readOnly />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
