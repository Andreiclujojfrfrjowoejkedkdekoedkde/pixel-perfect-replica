import { overpass, localCategory, offlineRouter } from "./offline-data";
import { decodePolyline } from "./format";
import type { TravelMode } from "./settings";

export type Place = {
  id: string; // "N123" | "W45" | "R6" | "@lat,lon"
  name: string;
  subtitle: string;
  kind: string;
  lon: number;
  lat: number;
};

const typeLetter = (t: string) => (t === "node" || t === "N" ? "N" : t === "way" || t === "W" ? "W" : "R");

function humanKind(key?: string, value?: string) {
  if (!value) return "Place";
  if (["house", "building", "residential", "yes"].includes(value)) return "Address";
  if (key === "place") return value.charAt(0).toUpperCase() + value.slice(1);
  return value.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export async function photonSearch(q: string, center: [number, number], signal?: AbortSignal): Promise<Place[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${center[1]}&lon=${center[0]}&limit=8&lang=en`;
  const r = await fetch(url, { signal: signal ?? null });
  if (!r.ok) throw new Error("Search is unavailable right now.");
  const j = await r.json();
  return (j.features ?? []).map((f: any) => {
    const p = f.properties;
    const name = p.name ?? [p.street, p.housenumber].filter(Boolean).join(" ") ?? "Unnamed";
    const subtitle = [p.name ? [p.street, p.housenumber].filter(Boolean).join(" ") : null, p.city ?? p.county, p.country]
      .filter(Boolean).join(", ");
    return {
      id: `${typeLetter(p.osm_type)}${p.osm_id}`,
      name: name || "Unnamed",
      subtitle,
      kind: humanKind(p.osm_key, p.osm_value),
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    } satisfies Place;
  });
}

export const CATEGORIES = [
  { id: "fuel", label: "Fuel", tag: '["amenity"="fuel"]' },
  { id: "food", label: "Food", tag: '["amenity"~"^(restaurant|cafe|fast_food)$"]' },
  { id: "parking", label: "Parking", tag: '["amenity"="parking"]' },
  { id: "charging", label: "Charging", tag: '["amenity"="charging_station"]' },
  { id: "pharmacy", label: "Pharmacy", tag: '["amenity"="pharmacy"]' },
  { id: "lodging", label: "Lodging", tag: '["tourism"~"^(hotel|hostel|guest_house|motel)$"]' },
] as const;

export async function categorySearch(tag: string, bbox: [number, number, number, number], signal?: AbortSignal): Promise<Place[]> {
  const [w, s, e, n] = bbox;
  const q = `[out:json][timeout:20];nwr${tag}(${s},${w},${n},${e});out center tags 2000;`;
  const j = await overpass(q, signal);
  return (j.elements ?? []).map((el: any) => {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    return {
      id: `${typeLetter(el.type)}${el.id}`,
      name: t.name ?? t.brand ?? t.operator ?? humanKind(undefined, t.amenity ?? t.tourism),
      subtitle: [t["addr:street"], t["addr:housenumber"], t["addr:city"]].filter(Boolean).join(" "),
      kind: humanKind(undefined, t.amenity ?? t.tourism),
      lon, lat,
    } satisfies Place;
  }).filter((p: Place) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export type PlaceDetails = Place & {
  address: string;
  openingHours?: string;
  phone?: string;
  website?: string;
};

export async function placeDetails(id: string): Promise<PlaceDetails> {
  if (id.startsWith("@")) {
    const [lat = 0, lon = 0] = id.slice(1).split(",").map(Number);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2`);
    const j = r.ok ? await r.json() : {};
    return {
      id, lat, lon, kind: "Dropped pin",
      name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      subtitle: j.display_name ?? "",
      address: j.display_name ?? "",
    };
  }
  const r = await fetch(`https://nominatim.openstreetmap.org/lookup?osm_ids=${id}&format=jsonv2&extratags=1&addressdetails=1`);
  if (!r.ok) throw new Error("Could not load this place.");
  const [j] = await r.json();
  if (!j) throw new Error("This place could not be found.");
  const x = j.extratags ?? {};
  return {
    id,
    lat: +j.lat,
    lon: +j.lon,
    name: j.name || j.display_name.split(",")[0],
    subtitle: j.display_name,
    kind: humanKind(j.category, j.type),
    address: j.display_name,
    openingHours: x.opening_hours,
    phone: x.phone ?? x["contact:phone"],
    website: x.website ?? x["contact:website"],
  };
}

/* ---------------- Routing ---------------- */

export type Maneuver = { instruction: string; verbal?: string; type: number; street: string; length: number; time: number; beginIndex: number };
export type Route = { coords: [number, number][]; distance: number; duration: number; maneuvers: Maneuver[]; offline?: boolean };
export type RouteOptions = { mode: TravelMode; avoidTolls: boolean; avoidHighways: boolean; avoidFerries: boolean; avoidUnpaved: boolean; language?: string };

export interface RoutingEngine {
  name: string;
  route(stops: [number, number][], opts: RouteOptions): Promise<Route[]>;
}

export const valhalla: RoutingEngine = {
  name: "Valhalla",
  async route(stops, opts) {
    const costing = opts.mode === "drive" ? "auto" : opts.mode === "walk" ? "pedestrian" : "bicycle";
    const co: Record<string, unknown> = {};
    if (costing === "auto") {
      co["auto"] = {
        use_tolls: opts.avoidTolls ? 0 : 0.5,
        use_highways: opts.avoidHighways ? 0 : 1,
        use_ferry: opts.avoidFerries ? 0 : 0.5,
        exclude_unpaved: opts.avoidUnpaved,
      };
    }
    const body = {
      locations: stops.map(([lon, lat]) => ({ lat, lon })),
      costing,
      costing_options: co,
      units: "kilometers",
      language: opts.language ?? "en-US",
      alternates: stops.length === 2 ? 2 : 0,
    };
    const r = await fetch(`https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(body))}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? "No route found.");
    const toRoute = (trip: any): Route => {
      const coords: [number, number][] = [];
      const maneuvers: Maneuver[] = [];
      for (const leg of trip.legs) {
        const offset = coords.length;
        coords.push(...decodePolyline(leg.shape));
        for (const m of leg.maneuvers) {
          maneuvers.push({
            instruction: m.instruction,
            verbal: m.verbal_pre_transition_instruction,
            type: m.type,
            street: (m.street_names ?? [])[0] ?? "",
            length: m.length * 1000,
            time: m.time,
            beginIndex: offset + m.begin_shape_index,
          });
        }
      }
      return { coords, maneuvers, distance: trip.summary.length * 1000, duration: trip.summary.time };
    };
    return [j.trip, ...(j.alternates ?? []).map((a: any) => a.trip)].map(toRoute);
  },
};

export async function mapillaryImageNear(lon: number, lat: number, token: string): Promise<string | null> {
  const d = 0.0006;
  const r = await fetch(`https://graph.mapillary.com/images?access_token=${token}&fields=id&limit=1&bbox=${lon - d},${lat - d},${lon + d},${lat + d}`);
  if (!r.ok) return null;
  const j = await r.json();
  return j.data?.[0]?.id ?? null;
}

export const routingEngine: RoutingEngine = {
  name: "Meridian",
  async route(stops, opts) {
    if (!navigator.onLine) return offlineRouter.route(stops, opts);
    try { return await valhalla.route(stops, opts); }
    catch (error) { try { return await offlineRouter.route(stops, opts); } catch { throw error; } }
  },
};
export async function nearbyCategory(id: string, tag: string, bbox: [number, number, number, number], signal?: AbortSignal) {
  const center: [number, number] = [(bbox[0]+bbox[2])/2, (bbox[1]+bbox[3])/2];
  const local = await localCategory(id, center).catch(() => null);
  if (local && !navigator.onLine) return local;
  try { return await categorySearch(tag,bbox,signal); }
  catch (e) { if (local?.length) return local; throw e; }
}
