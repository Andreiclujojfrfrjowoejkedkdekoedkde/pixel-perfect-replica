import { useEffect } from "react";
import { useMapState } from "./MapContext";
import { location } from "@/lib/platform";

export function useCityDrift(enabled: boolean) {
  const { map, position, setPosition } = useMapState();
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void navigator.permissions?.query({ name: "geolocation" }).then(async permission => {
      if (permission.state !== "granted") return;
      const value = await location.once();
      if (active) setPosition(value);
    }).catch(() => {});
    return () => { active = false; };
  }, [enabled, setPosition]);
  useEffect(() => {
    if (!enabled || !map) return;
    const controller = new AbortController();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const anchor = position ? [position.lon, position.lat] : map.getCenter().toArray();
    const lon = anchor[0], lat = anchor[1];
    if (lon === undefined || lat === undefined || !Number.isFinite(lon + lat)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const width = 0.08 / Math.max(0.3, Math.cos(lat * Math.PI / 180));
    let bounds = [lon - width, lat - 0.06, lon + width, lat + 0.06];
    let points: [number, number][] = [];
    let index = 0;
    const makePoints = () => {
      const [west = lon, south = lat, east = lon, north = lat] = bounds;
      points = [];
      for (let row = 0; row < 5; row++) {
        const y = south + (north - south) * row / 4;
        points.push(row % 2 ? [east, y] : [west, y], row % 2 ? [west, y] : [east, y]);
      }
      for (let column = 0; column < 5; column++) {
        const x = west + (east - west) * column / 4;
        points.push(column % 2 ? [x, north] : [x, south], column % 2 ? [x, south] : [x, north]);
      }
    };
    makePoints();
    const sweep = () => {
      if (stopped || reduced.matches || document.hidden) return;
      const target = points[index % points.length];
      if (!target) return;
      index++;
      try { map.easeTo({ center: target, zoom: 13.7, pitch: 0, bearing: 0, duration: 150000, easing: t => t }); } catch { return; }
      timer = setTimeout(sweep, 150500);
    };
    try { map.jumpTo({ center: [lon, lat], zoom: 13.7, pitch: 0, bearing: 0 }); } catch { return; }
    sweep();
    void fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&zoom=10&format=jsonv2`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null).then(data => {
        const box = data?.boundingbox?.map(Number);
        if (stopped || !box || box.length !== 4 || !box.every(Number.isFinite)) return;
        const [south, north, west, east] = box;
        if (north <= south || east <= west || north - south > 3 || east - west > 4) return;
        bounds = [west, south, east, north]; makePoints();
      }).catch(() => {});
    const resume = () => {
      clearTimeout(timer);
      try { map.stop(); } catch { /* disposed */ }
      if (!document.hidden && !reduced.matches) sweep();
    };
    document.addEventListener("visibilitychange", resume);
    reduced.addEventListener("change", resume);
    return () => { stopped = true; controller.abort(); clearTimeout(timer); document.removeEventListener("visibilitychange", resume); reduced.removeEventListener("change", resume); try { map.stop(); } catch { /* disposed */ } };
  }, [enabled, map, position?.lat, position?.lon]);
}
