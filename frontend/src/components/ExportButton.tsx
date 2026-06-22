import { RefObject, useState } from "react";
import { toPng } from "html-to-image";

interface ExportButtonProps {
  targetRef: RefObject<HTMLDivElement | null>;
  locationName: string;
}

export default function ExportButton({ targetRef, locationName }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (!targetRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(targetRef.current, {
        backgroundColor: "#f0fdf4",
        pixelRatio: 2,
        style: { padding: "16px" },
      });
      const link = document.createElement("a");
      link.download = `${locationName.replace(/\s+/g, "-").toLowerCase()}-inventory.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="btn-secondary flex items-center gap-2 text-sm"
      title="Export as image"
    >
      <span>{exporting ? "⏳" : "📷"}</span>
      <span>{exporting ? "Exporting…" : "Export"}</span>
    </button>
  );
}
