import { useEffect, useRef } from "react";
import type { Marker } from "maplibre-gl";
import { Navigation } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";

/**
 * The vehicle marker: a heading-up arrow that turns with the car. Using the
 * device bearing (and falling back to the direction of travel along the route)
 * is what makes the map read as "where am I going" rather than "north is up".
 */
export function VehicleMarker({
  bearing,
  navigating,
}: {
  bearing: number | null;
  navigating: boolean;
}) {
  const { map, styleVersion } = useMapState();
  const marker = useRef<Marker | null>(null);
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const mod = import("maplibre-gl");
    (async () => {
      const ml = await mod;
      if (!live || !map) return;
      const node = document.createElement("div");
      node.className = "relative flex h-9 w-9 items-center justify-center";
      node.innerHTML = `<span class="absolute inset-0 rounded-full bg-primary/20"></span><span class="vehicle-puck">${NAV_SVG}</span>`;
      el.current = node.firstElementChild as HTMLDivElement;
      marker.current = new ml.Marker({ element: node, anchor: "center" }).addTo(map);
    })();
    return () => {
      live = false;
      marker.current?.remove();
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, styleVersion]);

  useEffect(() => {
    const node = el.current;
    if (node) {
      node.style.transform = `rotate(${bearing ?? 0}deg)`;
      node.style.transition = "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)";
    }
  }, [bearing, navigating]);

  return null;
}

const NAV_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#FBF6EC" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 L19 21 L12 17 L5 21 Z" fill="#D2692A"/></svg>`;

/** A quiet fallback for when there is no fix yet. */
export function LocatingBadge() {
  return (
    <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-xs text-muted-foreground">
      <Navigation strokeWidth={1.5} className="h-3.5 w-3.5 animate-pulse" /> Locating you
    </div>
  );
}
