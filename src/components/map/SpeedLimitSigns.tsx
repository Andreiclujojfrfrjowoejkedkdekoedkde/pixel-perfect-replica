import { useEffect, useRef } from "react";
import type { Marker } from "maplibre-gl";
import { useMapState } from "./MapContext";
import { useSettings } from "@/lib/settings";
import { useSpeedLimits } from "@/components/nav/SpeedLimitsContext";
import { LIMIT_UNIT_LABEL, formatLimit } from "@/lib/speedLimits";

/**
 * Draws a speed limit sign at every point along the active route where the
 * posted limit changes. Markers are DOM elements so the sign uses the same
 * liquid-glass type as the rest of the app instead of a glyph in a map font.
 */
export function SpeedLimitSigns() {
  const { map, styleVersion } = useMapState();
  const { settings } = useSettings();
  const { signs } = useSpeedLimits();
  const markers = useRef<Marker[]>([]);
  const key = signs.map((s) => `${s.lon},${s.lat},${s.limitKmh}`).join("|");

  useEffect(() => {
    const mlRef = import("maplibre-gl");
    let live = true;
    (async () => {
      const ml = await mlRef;
      if (!live || !map) return;
      for (const m of markers.current) m.remove();
      markers.current = [];
      for (const sign of signs) {
        const el = document.createElement("div");
        el.className = "pointer-events-auto select-none";
        el.title =
          sign.limitKmh == null
            ? "Limit unavailable"
            : `${formatLimit(sign.limitKmh, settings.units)} ${LIMIT_UNIT_LABEL[settings.units]}`;
        el.innerHTML = signFace(formatLimit(sign.limitKmh, settings.units), settings.units);
        markers.current.push(
          new ml.Marker({ element: el, offset: [0, -20], anchor: "bottom" })
            .setLngLat([sign.lon, sign.lat])
            .addTo(map),
        );
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, settings.units, styleVersion]);

  useEffect(
    () => () => {
      for (const m of markers.current) m.remove();
      markers.current = [];
    },
    [],
  );

  return null;
}

/** Inline SVG sign face: white circle with a red ring, or a neutral dashed plate. */
function signFace(value: string, units: "metric" | "imperial") {
  const known = value !== "—";
  if (known && units === "imperial") {
    return `<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden><rect x="1.5" y="1.5" width="31" height="41" rx="3" fill="#FBF6EC" stroke="#2A2119" stroke-width="3"/><text x="17" y="13" text-anchor="middle" font-size="6.5" font-weight="700" fill="#2A2119" font-family="system-ui">SPEED</text><text x="17" y="20" text-anchor="middle" font-size="6.5" font-weight="700" fill="#2A2119" font-family="system-ui">LIMIT</text><text x="17" y="37" text-anchor="middle" font-size="19" font-weight="700" fill="#2A2119" font-family="system-ui" style="font-variant-numeric:tabular-nums">${value}</text></svg>`;
  }
  const ring = known ? "#B5501B" : "#9C8A75";
  const fill = known ? "#FBF6EC" : "#EFE6D6";
  const dash = known ? "" : ' stroke-dasharray="5 4"';
  return `<svg width="38" height="38" viewBox="0 0 38 38" aria-hidden><circle cx="19" cy="19" r="17" fill="${fill}" stroke="${ring}" stroke-width="5"${dash}/><text x="19" y="19" text-anchor="middle" dominant-baseline="central" font-size="17" font-weight="700" fill="#2A2119" font-family="system-ui" style="font-variant-numeric:tabular-nums">${value}</text></svg>`;
}
