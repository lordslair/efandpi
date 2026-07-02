import { useRef, useEffect, type RefObject } from "react";
import { useZxing } from "react-zxing";

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const lastScan = useRef<string | null>(null);
  const cooldownRef = useRef(false);

  const { ref } = useZxing({
    constraints: { video: { facingMode: "environment" }, audio: false },
    onDecodeResult(result) {
      const value = result.rawValue;
      if (!value || cooldownRef.current) return;
      if (value === lastScan.current) return;

      lastScan.current = value;
      cooldownRef.current = true;
      setTimeout(() => {
        cooldownRef.current = false;
      }, 2000);

      onScan(value);
    },
  });

  // Lock body scroll while scanner is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={ref as RefObject<HTMLVideoElement>}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
        />

        {/* Overlay with scanning rect */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-64 h-40">
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-400 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-400 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-400 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-400 rounded-br-lg" />
            {/* Scan line animation */}
            <div className="absolute left-2 right-2 h-0.5 bg-brand-400 opacity-80 animate-scan" />
          </div>
        </div>

        {/* Dimmed corners */}
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 280px 180px at center, transparent 50%, rgba(0,0,0,0.6) 80%)"
          }}
        />
      </div>

      {/* Bottom bar */}
      <div className="bg-black px-6 py-6 text-center safe-area-bottom">
        <p className="text-white/70 text-sm mb-4">Point camera at a barcode</p>
        <button
          onClick={onClose}
          className="bg-white/10 text-white font-semibold px-8 py-3 rounded-2xl
                     active:scale-95 transition-transform border border-white/20"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
