import { useEffect, useState } from "react";
import { Crosshair, Layers, Plus, Minus, Box } from "lucide-react";
import { useMapState } from "./MapContext";
import { LayerSwitcher } from "./LayerSwitcher";
import { useSettings } from "@/lib/settings";

function CompassRose({ bearing }: { bearing: number }) {
  return (
    <svg viewBox="0 0 40 40" className="h-7 w-7" style={{ transform: `rotate(${-bearing}deg)` }} aria-hidden>
      <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.5" />
      <path d="M20 3 L23 20 L20 17 L17 20 Z" fill="var(--primary)" />
      <path d="M20 37 L17 20 L20 23 L23 20 Z" fill="currentColor" opacity="0.55" />
      <path d="M3 20 L20 18.5 L37 20 L20 21.5 Z" fill="currentColor" opacity="0.35" />
      <text x="20" y="11.5" textAnchor="middle" fontSize="5" fontFamily="var(--font-sans)" fontWeight="700" fill="var(--primary-foreground)">N</text>
    </svg>
  );
}

export function Controls({ layersOpen, setLayersOpen }: { layersOpen: boolean; setLayersOpen: (b: boolean) => void }) {
  const { map, position, setPosition } = useMapState();
  const { settings } = useSettings();
  const [bearing, setBearing] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!map) return;
    const f = () => { setBearing(map.getBearing()); setPitch(map.getPitch()); };
    map.on("rotate", f); map.on("pitch", f);
    return () => { map.off("rotate", f); map.off("pitch", f); };
  }, [map]);

  const locate = async () => {
    if (position) { map?.flyTo({ center: [position.lon, position.lat], zoom: Math.max(map.getZoom(), 15) }); return; }
    setLocating(true);
    const { location } = await import("@/lib/platform");
    location.once().then((p) => {
      setPosition(p);
      map?.flyTo({ center: [p.lon, p.lat], zoom: 15 });
    }).catch(() => {}).finally(() => setLocating(false));
  };

  const btn = "flex h-11 w-11 items-center justify-center rounded-xl text-foreground transition-colors hover:text-primary";
  const side = settings.leftHanded ? "left-3" : "right-3";

  return (
    <div className={`pointer-events-none absolute ${side} top-24 z-20 flex flex-col items-end gap-3 md:top-4`}>
      <div className="glass pointer-events-auto flex flex-col rounded-2xl p-1">
        <button className={btn} aria-label="Map layers (L)" aria-expanded={layersOpen} onClick={() => setLayersOpen(!layersOpen)}><Layers strokeWidth={1.5} /></button>
        <button className={btn} aria-label="Show my location" onClick={locate}><Crosshair strokeWidth={1.5} className={locating ? "animate-pulse text-primary" : ""} /></button>
        <button className={btn} aria-label="Reset north and tilt" onClick={() => map?.easeTo({ bearing: 0, pitch: 0 })}><CompassRose bearing={bearing} /></button>
        <button className={btn} aria-label={pitch > 10 ? "Flatten map" : "Tilt map"} onClick={() => map?.easeTo({ pitch: pitch > 10 ? 0 : 60 })}><Box strokeWidth={1.5} /></button>
      </div>
      <div className="glass pointer-events-auto hidden flex-col rounded-2xl p-1 md:flex">
        <button className={btn} aria-label="Zoom in" onClick={() => map?.zoomIn()}><Plus strokeWidth={1.5} /></button>
        <div className="hairline mx-2" />
        <button className={btn} aria-label="Zoom out" onClick={() => map?.zoomOut()}><Minus strokeWidth={1.5} /></button>
      </div>
      {layersOpen && <div className="pointer-events-auto"><LayerSwitcher onClose={() => setLayersOpen(false)} /></div>}
    </div>
  );
}
