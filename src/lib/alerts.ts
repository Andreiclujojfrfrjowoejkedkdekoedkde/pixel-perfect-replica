// Speed cameras and school zones ahead on the route, from OSM tags.
//
// These are advisory only: OSM is community data and coverage is uneven. The
// wording is always "reported", never "there is a camera here for certain".

import { useEffect, useMemo, useRef, useState } from "react";
import { useMapState } from "@/components/map/MapContext";
import { useSettings } from "@/lib/settings";
import { haversine, projectOnLine } from "./format";
import { storage } from "./platform";
import type { OverpassElement } from "./services";

export type AlertKind = "speed_camera" | "school_zone";

export type RoadAlert = {
  id: string;
  kind: AlertKind;
  lon: number;
  lat: number;
  /** Metres ahead along the route. */
  metres: number;
  severity: "low" | "medium" | "high";
  title: string;
  spoken: string;
  /** Metres per hour for cameras; null for zones. */
  speed: number | null;
};

const TTL = 24 * 60 * 60 * 1000;
const CACHE_KEY = "road-alerts";
type Cache = { at: number; rows: AlertRow[] };
type AlertRow = {
  id: string;
  kind: AlertKind;
  lon: number;
  lat: number;
  speed: number | null;
};

const ALERT_RANGE = 3000;

const readCache = () => {
  const c = storage.get<Cache | null>(CACHE_KEY, null);
  return c && Date.now() - c.at < TTL ? c.rows : null;
};
const writeCache = (rows: AlertRow[]) =>
  storage.set(CACHE_KEY, { at: Date.now(), rows } satisfies Cache);

const query = (bbox: [number, number, number, number]) =>
  `[out:json][timeout:30];(` +
  `node["highway"="speed_camera"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});` +
  `nwr["maxspeed:type"="school:zone"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});` +
  `nwr["school:zone"](${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]});` +
  `);out center tags;`;

/** Fetch cameras and school zones around a route, cached for a day. */
export async function fetchRoadAlerts(
  route: [number, number][],
  signal?: AbortSignal,
): Promise<AlertRow[]> {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  for (const [lon, lat] of route) {
    w = Math.min(w, lon);
    e = Math.max(e, lon);
    s = Math.min(s, lat);
    n = Math.max(n, lat);
  }
  // Pad so cameras just off the route are still found.
  const pad = 0.005;
  const bbox: [number, number, number, number] = [w - pad, s - pad, e + pad, n + pad];
  const r = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: new URLSearchParams({ data: query(bbox) }),
    signal: signal ?? null,
  });
  if (!r.ok) throw new Error("Could not load road alerts.");
  const j = (await r.json()) as { elements?: OverpassElement[] };
  const rows: AlertRow[] = [];
  for (const el of j.elements ?? []) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const isCamera = t["highway"] === "speed_camera";
    const isSchool = t["maxspeed:type"] === "school:zone" || t["school:zone"] != null;
    if (!isCamera && !isSchool) continue;
    const parsed = parseSpeed(t["maxspeed"]);
    rows.push({
      id: `${el.type}${el.id}`,
      kind: isCamera ? "speed_camera" : "school_zone",
      lon,
      lat,
      speed: parsed,
    });
  }
  return rows;
}

function parseSpeed(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d{1,3})/.exec(raw.trim());
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isFinite(v) || v <= 0) return null;
  return /mph/i.test(raw) ? Math.round(v * 1.609344) : v;
}

const describe = (row: AlertRow, units: "metric" | "imperial"): RoadAlert => {
  const imperial = units === "imperial";
  const value = row.speed == null ? null : imperial ? Math.round(row.speed / 1.609344) : row.speed;
  const unit = imperial ? "mph" : "km/h";
  if (row.kind === "speed_camera") {
    return {
      id: row.id,
      kind: row.kind,
      lon: row.lon,
      lat: row.lat,
      metres: 0,
      severity: "medium",
      title: value ? `Speed camera reported · ${value} ${unit}` : "Speed camera reported",
      spoken: value
        ? `Speed camera reported ahead, ${value} ${unit}.`
        : "Speed camera reported ahead.",
      speed: row.speed,
    };
  }
  return {
    id: row.id,
    kind: "school_zone",
    lon: row.lon,
    lat: row.lat,
    metres: 0,
    severity: row.speed && row.speed <= 30 ? "high" : "medium",
    title: value ? `School zone · ${value} ${unit}` : "School zone reported",
    spoken: value ? `School zone ahead, ${value} ${unit}.` : "School zone ahead. Slow down.",
    speed: row.speed,
  };
};

/**
 * Alerts ahead of the driver on the active route, nearest first. `travelled` is
 * how far along the route the driver already is, in metres, so "ahead" means
 * ahead of them and not merely ahead of the start line.
 */
export function useRoadAlerts(travelled: number) {
  const { routes, activeRoute } = useMapState();
  const { settings } = useSettings();
  const route = routes[activeRoute];
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [failed, setFailed] = useState(false);
  const key = route ? `${route.coords.length}-${route.coords[0]?.join(",")}` : null;
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!route || !key) return;
    const cached = readCache();
    if (cached) {
      setRows(cached);
      setFailed(false);
      return;
    }
    if (inFlight.current === key) return;
    const ac = new AbortController();
    inFlight.current = key;
    fetchRoadAlerts(route.coords, ac.signal)
      .then((r) => {
        writeCache(r);
        setRows(r);
        setFailed(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        inFlight.current = null;
        setFailed(true);
      });
    return () => ac.abort();
  }, [route, key]);

  const alerts = useMemo<RoadAlert[]>(() => {
    if (!route) return [];
    const wanted = (r: AlertRow) =>
      r.kind === "speed_camera" ? settings.cameraAlerts : settings.schoolAlerts;
    return rows
      .filter(wanted)
      .map((row) => {
        const along = projectOnLine([row.lon, row.lat], route.coords);
        const alongRoute = along.distance > 120 ? null : along.metres(route.coords);
        return alongRoute == null
          ? null
          : { ...describe(row, settings.units), metres: alongRoute - travelled };
      })
      .filter((a): a is RoadAlert => !!a && a.metres > 20 && a.metres <= ALERT_RANGE)
      .sort((a, z) => a.metres - z.metres)
      .slice(0, 4);
  }, [rows, route, travelled, settings.cameraAlerts, settings.schoolAlerts, settings.units]);

  return { alerts, failed, clear: () => storage.set(CACHE_KEY, null) };
}
