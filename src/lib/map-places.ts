import type { Map as MLMap } from "maplibre-gl";
import type { Place } from "./services";

const kinds: Record<string, string[]> = {
  food: ["restaurant", "cafe", "fast_food", "food_court", "ice_cream"],
  fuel: ["fuel"], parking: ["parking"], charging: ["charging_station"],
  pharmacy: ["pharmacy"], lodging: ["hotel", "hostel", "guest_house", "motel", "lodging"],
};

// Loaded OpenMapTiles POIs are real OSM data, not generated results. Their IDs
// are tile-encoded, so use coordinate pins rather than inventing OSM IDs.
export function visibleMapPlaces(map: MLMap, category: string): Place[] {
  if (!map.getSource("omt")) return [];
  const bounds = map.getBounds();
  const found = new Map<string, Place>();
  for (const feature of map.querySourceFeatures("omt", { sourceLayer: "poi" })) {
    const p = feature.properties;
    const kind = String(p?.["subclass"] ?? p?.["class"] ?? "");
    if (!kinds[category]?.includes(kind) && !(category === "lodging" && p?.["class"] === "lodging")) continue;
    if (feature.geometry.type !== "Point") continue;
    const [lon, lat] = feature.geometry.coordinates;
    if (typeof lon !== "number" || typeof lat !== "number" || !bounds.contains([lon, lat])) continue;
    const name = String(p?.["name"] ?? p?.["name:latin"] ?? kind.replaceAll("_", " "));
    const id = `@${lat.toFixed(6)},${lon.toFixed(6)}`;
    found.set(`${id}:${name}`, { id, lon, lat, name, subtitle: "", kind: kind.replaceAll("_", " ").replace(/^\w/, c => c.toUpperCase()) });
  }
  return [...found.values()];
}