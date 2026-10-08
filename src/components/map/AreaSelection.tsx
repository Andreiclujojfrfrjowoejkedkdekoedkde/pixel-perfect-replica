import { useEffect, useRef } from "react";
import type { GeoJSONSource, Marker } from "maplibre-gl";
import { useMapState } from "./MapContext";
import { routeColor } from "@/lib/mapStyle";
import { useSettings } from "@/lib/settings";

export type AreaBounds = [number, number, number, number];

export function AreaSelection({ bounds, first, onChange }: { bounds: AreaBounds | null; first: [number, number] | null; onChange: (bounds: AreaBounds) => void }) {
  const { map, styleVersion } = useMapState();
  const { dark } = useSettings();
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;
    let disposed = false;
    const handles: Marker[] = [];
    const id = "meridian-area-selection";
    const draw = (b: AreaBounds | null) => {
      const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: b ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } }] : [] };
      const source = map.getSource(id) as GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.addSource(id, { type: "geojson", data });
        map.addLayer({ id: `${id}-fill`, type: "fill", source: id, paint: { "fill-color": routeColor(dark), "fill-opacity": 0.14 } });
        map.addLayer({ id: `${id}-line`, type: "line", source: id, paint: { "line-color": routeColor(dark), "line-width": 2.5, "line-dasharray": [3, 2] } });
      }
    };
    draw(bounds);
    const move = (event: { lngLat: { lng: number; lat: number } }) => {
      if (first) draw([Math.min(first[0], event.lngLat.lng), Math.min(first[1], event.lngLat.lat), Math.max(first[0], event.lngLat.lng), Math.max(first[1], event.lngLat.lat)]);
    };
    if (first) map.on("mousemove", move);
    void import("maplibre-gl").then(({ Marker: MapMarker }) => {
      if (disposed) return;
      const corners: [number, number][] = bounds ? [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]]] : first ? [first] : [];
      corners.forEach((coord, index) => {
        const element = document.createElement("div");
        element.className = "area-corner";
        element.setAttribute("role", "img");
        element.setAttribute("aria-label", `Area corner ${index + 1}`);
        element.textContent = `${index + 1}`;
        const marker = new MapMarker({ element, draggable: !!bounds }).setLngLat(coord).addTo(map);
        handles.push(marker);
        const update = () => {
          if (!bounds) return;
          const opposite = corners[(index + 2) % 4];
          if (!opposite) return;
          const point = marker.getLngLat();
          const next: AreaBounds = [Math.min(point.lng, opposite[0]), Math.min(point.lat, opposite[1]), Math.max(point.lng, opposite[0]), Math.max(point.lat, opposite[1])];
          draw(next);
          return next;
        };
        marker.on("drag", update);
        marker.on("dragend", () => { const next = update(); if (next) change.current(next); });
      });
    });
    return () => {
      disposed = true;
      map.off("mousemove", move);
      handles.forEach(handle => handle.remove());
      if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
      if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`);
      if (map.getSource(id)) map.removeSource(id);
    };
  }, [map, styleVersion, bounds, first, dark]);
  return null;
}