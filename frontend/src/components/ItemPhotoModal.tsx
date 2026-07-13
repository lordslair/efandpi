import { useState } from "react";
import * as api from "../api/client";
import ImageCropModal from "./ImageCropModal";

interface ItemPhotoModalProps {
  locationId: number;
  item: api.Item;
  onClose: () => void;
  onUpdated: (item: api.Item) => void;
}

export default function ItemPhotoModal({
  locationId,
  item,
  onClose,
  onUpdated,
}: ItemPhotoModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) setPendingFile(f);
  }

  function handleCropComplete(croppedFile: File) {
    setFile(croppedFile);
    setPreview(URL.createObjectURL(croppedFile));
    setPendingFile(null);
  }

  function handleCropCancel() {
    setPendingFile(null);
    setInputKey((k) => k + 1);
  }

  async function handleUpload() {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.uploadItemImage(locationId, item.id, file);
      onUpdated(updated);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.deleteItemImage(locationId, item.id);
      onUpdated(updated);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove photo");
    } finally {
      setSaving(false);
    }
  }

  if (pendingFile) {
    return (
      <ImageCropModal
        file={pendingFile}
        onCancel={handleCropCancel}
        onComplete={handleCropComplete}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
      <div className="card w-full max-w-sm mb-safe">
        <h3 className="text-lg font-semibold mb-4">Product photo</h3>

        <div className="w-24 h-24 mx-auto mb-4 rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
          <img
            src={preview ?? item.custom_image_url ?? item.thumbnail_url ?? undefined}
            alt=""
            className="w-full h-full object-contain"
          />
        </div>

        <input
          key={inputKey}
          type="file"
          aria-label="Product photo"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="input-field mb-4"
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-3">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {item.custom_image_url && (
            <button className="btn-secondary flex-1" onClick={handleRemove} disabled={saving}>
              Remove
            </button>
          )}
          <button
            className="btn-primary flex-1"
            onClick={handleUpload}
            disabled={!file || saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
