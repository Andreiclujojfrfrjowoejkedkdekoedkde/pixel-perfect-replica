import { X } from "lucide-react";
import { useMapState } from "./MapContext";

export function StreetViewer() {
  const { streetImage, setStreetImage } = useMapState();
  if (!streetImage) return null;
  return (
    <div role="dialog" aria-label="Street view" className="absolute inset-0 z-50 bg-background lg:left-1/2 lg:border-l">
      <iframe
        title="Street-level imagery"
        src={`https://www.mapillary.com/embed?image_key=${streetImage}&style=photo`}
        className="h-full w-full border-0"
        allow="fullscreen"
      />
      <div className="absolute left-3 top-3 flex items-center gap-2">
        <button onClick={() => setStreetImage(null)} aria-label="Close street view" className="glass flex h-11 w-11 items-center justify-center rounded-xl">
          <X strokeWidth={1.5} />
        </button>
        <span className="glass smallcaps rounded-full px-3 py-1.5 text-xs">Street view · Mapillary</span>
      </div>
    </div>
  );
}
