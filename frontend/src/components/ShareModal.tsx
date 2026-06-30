import { useEffect, useState } from "react";
import * as api from "../api/client";

interface ShareModalProps {
  locationId: number;
  onClose: () => void;
}

export default function ShareModal({ locationId, onClose }: ShareModalProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl = token
    ? `${window.location.origin}/share/${token}`
    : null;

  useEffect(() => {
    api
      .createShareLink(locationId)
      .then((link) => setToken(link.token))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not create share link")
      )
      .finally(() => setLoading(false));
  }, [locationId]);

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setCopied(false);
    setError(null);
    try {
      const link = await api.regenerateShareLink(locationId);
      setToken(link.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not regenerate link");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
      <div className="card w-full max-w-sm mb-safe">
        <h3 className="text-lg font-semibold mb-4">Share Location</h3>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">
            {error}
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-3">
              Anyone with this link can view this location's inventory (read-only, no account needed).
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono text-gray-700 break-all mb-4 select-all">
              {shareUrl}
            </div>

            <div className="flex gap-2 mb-3">
              <button
                className="btn-primary flex-1"
                onClick={handleCopy}
                aria-label="Copy share link"
              >
                {copied ? "✓ Copied!" : "Copy link"}
              </button>
            </div>

            <button
              className="text-xs text-gray-400 hover:text-gray-600 w-full text-center underline mb-4"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating ? "Regenerating…" : "Regenerate link (invalidates old link)"}
            </button>
          </>
        )}

        <button className="btn-secondary w-full" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
