import { useEffect, useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { cropImageToFile } from "../utils/cropImage";

interface ImageCropModalProps {
  file: File;
  onCancel: () => void;
  onComplete: (file: File) => void;
}

export default function ImageCropModal({ file, onCancel, onComplete }: ImageCropModalProps) {
  const [imageSrc] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => URL.revokeObjectURL(imageSrc);
  }, [imageSrc]);

  async function handleUseCrop() {
    if (!croppedAreaPixels) return;
    setCropping(true);
    setError(null);
    try {
      const cropped = await cropImageToFile(
        imageSrc,
        croppedAreaPixels,
        file.name,
        file.type || "image/jpeg"
      );
      onComplete(cropped);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to crop image");
      setCropping(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4">
      <div className="card w-full max-w-sm mb-safe">
        <h3 className="text-lg font-semibold mb-4">Crop photo</h3>

        <div className="relative w-full aspect-square bg-gray-900 rounded-xl overflow-hidden mb-4">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_area, areaPixels) => setCroppedAreaPixels(areaPixels)}
          />
        </div>

        <input
          type="range"
          aria-label="Zoom"
          min={1}
          max={3}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full mb-4"
        />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-3">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={onCancel} disabled={cropping}>
            Cancel
          </button>
          <button
            className="btn-secondary flex-1"
            onClick={() => onComplete(file)}
            disabled={cropping}
          >
            Skip
          </button>
          <button
            className="btn-primary flex-1"
            onClick={handleUseCrop}
            disabled={cropping || !croppedAreaPixels}
          >
            {cropping ? "Cropping…" : "Use Photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
