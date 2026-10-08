import { useEffect, useRef } from "react";
import type { Feature, FeatureCollection } from "geojson";
import { useNavigate } from "@tanstack/react-router";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import { useMapState } from "./MapContext";
import { useSettings, env } from "@/lib/settings";
import { buildStyle, routeColor, altRouteColor, routeRimColor, routeArrowColor, orderMapOverlays } from "@/lib/mapStyle";
import { mapillaryImageNear } from "@/lib/services";
import { storage } from "@/lib/platform";

// Single map canvas for the whole app. maplibre-gl is imported dynamically so
// it never runs during server rendering.
export function MapCanvas() {
  const el = useRef<HTMLDivElement>(null);
  const st = useMapState();
  const { settings, dark } = useSettings();
  const navigate = useNavigate();
  const mapRef = useRef<MLMap | null>(null);
  const modeRef = useRef(st.mode);
  modeRef.current = st.mode;
  const pickRef = useRef(st.pickPoint);
  pickRef.current = st.pickPoint;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let cancelled = false;
    let map: MLMap;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !el.current) return;
      const view = storage.get<{ c: [number, number]; z: number }>("view", { c: [23.59, 46.77], z: 12 });
      map = new ml.Map({
        container: el.current,
        style: buildStyle(st.mode, { dark, buildings3d: settings.buildings3d, labelScale: settings.labelScale, earthLabels: settings.earthLabels }),
        center: view.c,
        zoom: view.z,
        maxPitch: 70,
        attributionControl: { compact: true },
        canvasContextAttributes: { antialias: true },
      });
      map.addControl(new ml.ScaleControl({ maxWidth: 110, unit: settings.units === "imperial" ? "imperial" : "metric" }), "bottom-left");
      // An exception inside a MapLibre event handler kills its render loop and
      // freezes the map (no dragging). localStorage can throw when full or
      // blocked, so keep every handler body in try/catch.
      map.on("moveend", () => {
        try { if (settingsRef.current.locationHistory && !el.current?.closest(".homepage-map")) storage.set("view", { c: map.getCenter().toArray(), z: map.getZoom() }); } catch { /* storage full/blocked */ }
      });
      map.on("style.load", () => st.bumpStyle());
      map.on("contextmenu", (e) => {
        try { navigate({ to: "/place/$id", params: { id: `@${e.lngLat.lat.toFixed(6)},${e.lngLat.lng.toFixed(6)}` } }); } catch { /* ignore */ }
      });
      map.on("click", (e) => {
        (async () => {
          try {
             if (pickRef.current) { pickRef.current([e.lngLat.lng, e.lngLat.lat]); return; }
             const cluster = map.getLayer("meridian-clusters") ? map.queryRenderedFeatures(e.point, { layers: ["meridian-clusters"] })[0] : undefined;
             if (cluster?.geometry.type === "Point") {
               const source = map.getSource("meridian-markers") as GeoJSONSource;
               const zoom = await source.getClusterExpansionZoom(Number(cluster.properties?.["cluster_id"]));
               const [lon, lat] = cluster.geometry.coordinates;
               if (typeof lon === "number" && typeof lat === "number") map.easeTo({ center: [lon, lat], zoom });
               return;
             }
            if (modeRef.current === "street" && env.mapillary) {
              const id = await mapillaryImageNear(e.lngLat.lng, e.lngLat.lat, env.mapillary);
              if (id) st.setStreetImage(id);
              return;
            }
            const f = map.queryRenderedFeatures(e.point, { layers: ["meridian-markers"].filter((l) => map.getLayer(l)) })[0];
            if (f?.properties?.["id"]) navigate({ to: "/place/$id", params: { id: String(f.properties["id"]) } });
          } catch { /* ignore */ }
        })();
      });
      mapRef.current = map;
      st.setMap(map);
    })();
    return () => {
      cancelled = true;
      map?.remove();
      st.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restyle when mode/theme/options change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(buildStyle(st.mode, { dark, buildings3d: settings.buildings3d, labelScale: settings.labelScale, earthLabels: settings.earthLabels }), { diff: false });
    if (st.mode === "3d") map.easeTo({ pitch: 60, duration: 900 });
    else if (st.mode !== "earth" && !st.navigating) map.easeTo({ pitch: 0, duration: 600 });
    if (st.mode === "earth" && map.getZoom() > 5) map.easeTo({ zoom: 3, duration: 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.mode, dark, settings.buildings3d, settings.labelScale, settings.earthLabels]);

  // Overlays: routes, markers, user position. Re-added after each style load.
  useEffect(() => {
    const map = st.map;
    if (!map || !map.getStyle()?.layers) return;
    const set = (id: string, data: FeatureCollection) => {
      const s = map.getSource(id) as GeoJSONSource | undefined;
      if (s) s.setData(data);
      else map.addSource(id, { type: "geojson", data, ...(id === "meridian-markers" ? { cluster: true, clusterRadius: 50, clusterMaxZoom: 14 } : {}) });
    };

    const lines: Feature[] = st.routes.map((r, i) => ({
      type: "Feature",
      properties: { active: i === st.activeRoute ? 1 : 0 },
      geometry: { type: "LineString", coordinates: r.coords },
    }));
    lines.sort((a, b) => Number(a.properties?.["active"] ?? 0) - Number(b.properties?.["active"] ?? 0));
    set("meridian-route", { type: "FeatureCollection", features: lines });
    if (!map.getLayer("meridian-route-case")) {
      map.addLayer({ id: "meridian-route-case", type: "line", source: "meridian-route", layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["get", "active"] }, paint: { "line-color": routeRimColor(dark), "line-width": ["interpolate", ["linear"], ["zoom"], 8, 7, 13, 10, 17, 16], "line-opacity": 0.95 } });
      map.addLayer({ id: "meridian-route-line", type: "line", source: "meridian-route", layout: { "line-cap": "round", "line-join": "round", "line-sort-key": ["get", "active"] }, paint: { "line-color": ["case", ["==", ["get", "active"], 1], routeColor(dark), altRouteColor(dark)], "line-width": ["interpolate", ["linear"], ["zoom"], 8, 4, 13, 6, 17, 11], "line-opacity": ["case", ["==", ["get", "active"], 1], 1, 0.7] } });
      map.addLayer({ id: "meridian-route-arrows", type: "symbol", source: "meridian-route", minzoom: 12, filter: ["==", ["get", "active"], 1], layout: { "symbol-placement": "line", "symbol-spacing": 100, "text-field": "›", "text-font": ["Noto Sans Bold"], "text-size": 23, "text-keep-upright": false, "text-rotation-alignment": "map", "text-pitch-alignment": "map", "text-allow-overlap": true, "text-ignore-placement": true }, paint: { "text-color": routeArrowColor(), "text-halo-color": routeColor(dark), "text-halo-width": 1 } });
    }

    set("meridian-markers", {
      type: "FeatureCollection",
      features: st.markers.map((m) => ({ type: "Feature", properties: { id: m.id, name: m.name }, geometry: { type: "Point", coordinates: [m.lon, m.lat] } })),
    });
    if (!map.getLayer("meridian-markers")) {
      map.addLayer({ id: "meridian-clusters", type: "circle", source: "meridian-markers", filter: ["has", "point_count"], paint: { "circle-radius": ["step", ["get", "point_count"], 17, 20, 22, 100, 28], "circle-color": routeColor(dark), "circle-stroke-color": dark ? "#1B1612" : "#FBF6EC", "circle-stroke-width": 2.5 } });
      map.addLayer({ id: "meridian-cluster-count", type: "symbol", source: "meridian-markers", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12 }, paint: { "text-color": dark ? "#1B1612" : "#FBF6EC" } });
      map.addLayer({ id: "meridian-markers", type: "circle", source: "meridian-markers", filter: ["!", ["has", "point_count"]], paint: { "circle-radius": 7, "circle-color": routeColor(dark), "circle-stroke-color": dark ? "#1B1612" : "#FBF6EC", "circle-stroke-width": 2.5 } });
      map.addLayer({ id: "meridian-marker-labels", type: "symbol", source: "meridian-markers", filter: ["!", ["has", "point_count"]], layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, 1.3], "text-anchor": "top", "text-optional": true }, paint: { "text-color": dark ? "#EDE3D1" : "#2A2119", "text-halo-color": dark ? "#1B1612" : "#F1E9DA", "text-halo-width": 1.5 } });
    }

    const p = st.position;
    set("meridian-me", {
      type: "FeatureCollection",
      features: p ? [{ type: "Feature", properties: { acc: p.accuracy }, geometry: { type: "Point", coordinates: [p.lon, p.lat] } }] : [],
    });
    if (!map.getLayer("meridian-me")) {
      map.addLayer({ id: "meridian-me-halo", type: "circle", source: "meridian-me", paint: { "circle-radius": 18, "circle-color": routeColor(dark), "circle-opacity": 0.15 } });
      map.addLayer({ id: "meridian-me", type: "circle", source: "meridian-me", paint: { "circle-radius": 7, "circle-color": routeColor(dark), "circle-stroke-color": "#FBF6EC", "circle-stroke-width": 3 } });
    }
    orderMapOverlays(map);
  }, [st.map, st.styleVersion, st.routes, st.activeRoute, st.markers, st.position, dark]);

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" role="application" aria-label="Map. Right-click or long-press to drop a pin." />
    </div>
  );
}
