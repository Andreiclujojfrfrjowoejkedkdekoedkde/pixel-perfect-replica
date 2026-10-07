import { useEffect, useRef, useState } from "react";
import type { Marker } from "maplibre-gl";
import { OctagonAlert, X } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { useSettings } from "@/lib/settings";
import { useHazards } from "@/lib/hazardsStore";
import { CATEGORY_LABEL, type HazardCategory, type HazardSeverity } from "@/lib/hazards";
import { fmtDistance } from "@/lib/format";
import { HazardReport } from "./HazardReport";

const GLYPH: Record<HazardCategory, string> = {
  accident: "\u{1F4A5}",
  debris: "\u{1F9F9}",
  pothole: "\u{1F6AB}",
  flooding: "\u{1F30A}",
  ice_snow: "\u{2744}\uFE0F",
  stalled_vehicle: "\u{1F697}",
  road_work: "\u{1F6A7}",
  animal: "\u{1F42E}",
  police: "\u{1F6A8}",
  other: "\u{26A0}\uFE0F",
};

const SEVERITY_RING: Record<HazardSeverity, string> = {
  low: "#5C7A52",
  medium: "#B5812A",
  high: "#A63D22",
};

/** Hazards from other drivers, drawn as map markers with severity-coloured rings. */
export function HazardMarkers() {
  const { map, styleVersion } = useMapState();
  const { hazards, withdraw } = useHazards();
  const markers = useRef<Marker[]>([]);
  const key = hazards.map((h) => `${h.id}:${h.severity}`).join("|");

  useEffect(() => {
    const mod = import("maplibre-gl");
    let live = true;
    (async () => {
      const ml = await mod;
      if (!live || !map) return;
      for (const m of markers.current) m.remove();
      markers.current = [];
      for (const h of hazards) {
        const el = document.createElement("button");
        el.type = "button";
        el.className =
          "glass flex h-8 w-8 items-center justify-center rounded-full text-sm leading-none";
        el.style.borderColor = SEVERITY_RING[h.severity];
        el.title = `${CATEGORY_LABEL[h.category]} · ${h.summary}`;
        el.setAttribute(
          "aria-label",
          `${CATEGORY_LABEL[h.category]}. ${h.summary}. Reported ${h.mine ? "by you" : "by another driver"}.`,
        );
        el.textContent = GLYPH[h.category];
        el.onclick = () => {
          if (h.mine && globalThis.confirm?.("Withdraw your hazard report?")) void withdraw(h.id);
        };
        markers.current.push(
          new ml.Marker({ element: el, anchor: "center" }).setLngLat([h.lon, h.lat]).addTo(map),
        );
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, styleVersion]);

  useEffect(
    () => () => {
      for (const m of markers.current) m.remove();
      markers.current = [];
    },
    [],
  );

  return null;
}

/**
 * The report button, the sheet it opens, and the banner that warns about a
 * hazard on the road ahead. All three share one trigger.
 */
export function HazardReporter() {
  const { map, navigating } = useMapState();
  const { settings } = useSettings();
  const { notice, dismissNotice } = useHazards();
  const [open, setOpen] = useState(false);
  const side = settings.leftHanded ? "left-3" : "right-3";

  return (
    <>
      {notice && !open && (
        <div
          role="status"
          className="glass absolute inset-x-3 top-20 z-40 flex items-start gap-3 rounded-2xl p-3 md:inset-x-auto md:left-4 md:top-4 md:w-[420px]"
        >
          <OctagonAlert
            strokeWidth={1.5}
            className={`mt-0.5 h-5 w-5 shrink-0 ${notice.hazard.severity === "high" ? "text-destructive" : "text-traffic-slow"}`}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display">
              {CATEGORY_LABEL[notice.hazard.category]} in{" "}
              {fmtDistance(notice.aheadMetres, settings.units)}
            </p>
            <p className="line-clamp-2 text-sm text-muted-foreground">{notice.hazard.summary}</p>
            {notice.hazard.location_summary && (
              <p className="truncate text-xs text-muted-foreground">
                {notice.hazard.location_summary}
              </p>
            )}
          </div>
          <button
            onClick={() => {
              map?.flyTo({
                center: [notice.hazard.lon, notice.hazard.lat],
                zoom: Math.max(map.getZoom(), 16),
              });
              dismissNotice();
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-xs text-primary hover:bg-secondary"
          >
            Show
          </button>
          <button
            onClick={dismissNotice}
            aria-label="Dismiss hazard warning"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X strokeWidth={1.5} className="h-4 w-4" />
          </button>
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`glass absolute bottom-24 z-30 flex h-11 items-center gap-2 rounded-2xl px-3 text-sm md:bottom-4 ${side}`}
          aria-label="Report a road hazard"
        >
          <OctagonAlert strokeWidth={1.5} className="h-5 w-5 text-primary" />
          <span className={navigating ? "" : "hidden md:inline"}>Report hazard</span>
        </button>
      )}

      {open && <HazardReport onClose={() => setOpen(false)} />}
    </>
  );
}
