import { useEffect, useRef, useState } from "react";
import { useMapState } from "./MapContext";
import type { BBox } from "@/lib/offlineDb";

export type DrawShape =
  | { kind: "none" }
  | { kind: "rect"; west: number; south: number; east: number; north: number }
  | { kind: "poly"; points: [number, number][]; closing: boolean };

const CORNERS: (keyof Extract<DrawShape, { kind: "rect" }>)[] = ["west", "south", "east", "north"];

/**
 * Rectangle-with-handles and polygon drawing straight on the map. Uses MapLibre's
 * DOM markers so the handles follow the liquid-glass look instead of raw map
 * chrome, and works with mouse, touch and keyboard.
 */
export function AreaDrawer({
  shape,
  onChange,
}: {
  shape: DrawShape;
  onChange: (s: DrawShape) => void;
}) {
  const { map, styleVersion } = useMapState();
  const layer = useRef<HTMLDivElement>(null);
  const shapeRef = useRef(shape);
  shapeRef.current = shape;

  // Draw the outline as a GeoJSON source so it tracks panning and zooming.
  useEffect(() => {
    if (!map) return;
    const id = "meridian-draw";
    const features =
      shape.kind === "rect"
        ? [
            [shape.west, shape.south],
            [shape.east, shape.south],
            [shape.east, shape.north],
            [shape.west, shape.north],
            [shape.west, shape.south],
          ]
        : shape.kind === "poly"
          ? shape.points
          : [];
    const geo = {
      type: "FeatureCollection" as const,
      features: features.length
        ? [
            {
              type: "Feature" as const,
              properties: {},
              geometry: { type: "LineString" as const, coordinates: features },
            },
          ]
        : [],
    };
    const src = map.getSource(id) as { setData: (d: unknown) => void } | undefined;
    if (src) src.setData(geo);
    else {
      map.addSource(id, { type: "geojson", data: geo });
      map.addLayer({
        id: `${id}-fill`,
        type: "fill",
        source: id,
        paint: { "fill-color": "#B5501B", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: `${id}-line`,
        type: "line",
        source: id,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#B5501B", "line-width": 2.5, "line-dasharray": [3, 2] },
      });
    }
  }, [map, shape, styleVersion]);

  // Click-to-place polygon vertices.
  useEffect(() => {
    if (!map || shape.kind !== "poly") return;
    const onClick = (e: { lngLat: { lng: number; lat: number } }) => {
      const next = [
        ...(shapeRef.current.kind === "poly" ? shapeRef.current.points : []),
        [e.lngLat.lng, e.lngLat.lat] as [number, number],
      ];
      onChange({ kind: "poly", points: next, closing: false });
    };
    map.on("click", onClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [map, shape.kind, onChange]);

  if (shape.kind === "none") return null;

  const handles: { id: string; lon: number; lat: number; label: string }[] =
    shape.kind === "rect"
      ? [
          { id: "nw", lon: shape.west, lat: shape.north, label: "North west corner" },
          { id: "ne", lon: shape.east, lat: shape.north, label: "North east corner" },
          { id: "se", lon: shape.east, lat: shape.south, label: "South east corner" },
          { id: "sw", lon: shape.west, lat: shape.south, label: "South west corner" },
        ]
      : shape.points.map((p, i) => ({
          id: `p${i}`,
          lon: p[0],
          lat: p[1],
          label: `Point ${i + 1}`,
        }));

  return (
    <div ref={layer}>
      {handles.map((h) => (
        <Handle
          key={`${h.id}-${h.lon}-${h.lat}`}
          lon={h.lon}
          lat={h.lat}
          label={h.label}
          onDrag={(lon, lat) => drag(shapeRef.current, h.id, lon, lat, onChange)}
        />
      ))}
    </div>
  );
}

/** Map screen position for a handle, so the DOM markers stay glued to the geometry. */
function Handle({
  lon,
  lat,
  label,
  onDrag,
}: {
  lon: number;
  lat: number;
  label: string;
  onDrag: (lon: number, lat: number) => void;
}) {
  const { map, styleVersion } = useMapState();
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!map || !ref.current) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const p = map.project([lon, lat]);
      const el = ref.current;
      if (el) el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    place();
    map.on("move", schedule);
    map.on("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      map.off("move", schedule);
      map.off("resize", schedule);
    };
  }, [map, lon, lat, styleVersion]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let dragging = false;
    const move = (e: PointerEvent) => {
      if (!dragging || !map) return;
      const rect = map.getCanvas().getBoundingClientRect();
      onDrag(...map.unproject([e.clientX - rect.left, e.clientY - rect.top]).toArray());
    };
    const up = () => {
      dragging = false;
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    };
    const key = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 0.05 : 0.005;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      const d = moves[e.key];
      if (!d) return;
      e.preventDefault();
      onDrag(lon + d[0]!, lat + d[1]!);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("keydown", key);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("keydown", key);
    };
  }, [map, lon, lat, onDrag]);

  return (
    <button
      ref={ref}
      aria-label={label}
      title={`${label} — drag, or nudge with the arrow keys`}
      className="absolute left-0 top-0 z-20 h-5 w-5 cursor-grab touch-none rounded-full border-2 border-destructive bg-card shadow-lg active:cursor-grabbing"
    />
  );
}

/** Move one corner and keep the rectangle the right way round. */
function drag(
  current: DrawShape,
  id: string,
  lon: number,
  lat: number,
  onChange: (s: DrawShape) => void,
) {
  if (current.kind === "rect") {
    const next = { ...current };
    if ((id === "west" || id === "east") && id in CORNERS) next[id] = lon;
    if (id === "north" || id === "south") next[id] = lat;
    next.west = Math.min(next.west, next.east);
    next.east = Math.max(next.west, next.east);
    next.south = Math.min(next.south, next.north);
    next.north = Math.max(next.south, next.north);
    onChange(next);
    return;
  }
  if (current.kind === "poly") {
    const i = Number(id.slice(1));
    const points = current.points.map((p, j) => (j === i ? ([lon, lat] as [number, number]) : p));
    onChange({ ...current, points });
  }
}

export function shapeToBBox(shape: DrawShape): BBox | null {
  if (shape.kind === "rect") return [shape.west, shape.south, shape.east, shape.north];
  if (shape.kind === "poly" && shape.points.length >= 3) {
    const lons = shape.points.map((p) => p[0]);
    const lats = shape.points.map((p) => p[1]);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  }
  return null;
}
