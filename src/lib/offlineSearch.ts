import { useEffect, useState } from "react";
import { offlineDb, type BBox, type OfflinePlace } from "./offlineDb";
import { searchIndex } from "./offlineTiles";
import { network } from "./platform";
import { useOptionalMapState } from "@/components/map/MapContext";
import type { Place } from "./services";

/**
 * Searches the on-device index for downloaded areas. Returns nothing when the
 * app is online and the viewport is not covered, so the online geocoder stays in
 * charge and the user is never shown stale local names.
 *
 * Uses the optional map context because the home screen renders a search box
 * with no map behind it.
 */
export function useOfflineSearch() {
  const map = useOptionalMapState()?.map ?? null;
  const [places, setPlaces] = useState<OfflinePlace[] | null>(null);
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    if (!map) {
      setPlaces(null);
      setCovered(false);
      return;
    }
    let live = true;
    const load = async () => {
      const bbox = viewportBBox(map);
      const areas = await offlineDb.areasForBounds(bbox).catch(() => []);
      if (!live) return;
      setCovered(areas.length > 0);
      if (!areas.length) {
        setPlaces(null);
        return;
      }
      const merged: OfflinePlace[] = [];
      for (const a of areas) merged.push(...(await offlineDb.placesForArea(a.id).catch(() => [])));
      if (live) setPlaces(merged);
    };
    void load();
    const onMove = () => void load();
    map.on("moveend", onMove);
    return () => {
      live = false;
      map.off("moveend", onMove);
    };
  }, [map]);

  return {
    places,
    covered,
    /** Places become the primary source when the device is offline or covered. */
    shouldUse: (q: string) =>
      !!q.trim() && !!places && places.length > 0 && (!network.online() || covered),
  };
}

export function offlineResults(
  places: OfflinePlace[],
  q: string,
  origin: [number, number] | null,
  limit = 8,
): Place[] {
  return searchIndex(places, q, origin ?? undefined, limit).map((p) => ({
    id: p.id,
    name: p.name,
    subtitle: p.subtitle,
    kind: p.kind,
    lon: p.lon,
    lat: p.lat,
  }));
}

type BoundsLike = {
  getBounds: () => { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number };
};

export const viewportBBox = (map: BoundsLike): BBox => {
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
};
