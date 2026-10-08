import type { StyleSpecification, LayerSpecification, Map as MLMap } from "maplibre-gl";
import type { MapMode } from "./settings";
import { env } from "./settings";

// Hand-written cartographic style over OpenMapTiles-schema vector tiles.
// Map colours are literal hex here because MapLibre paints outside CSS.

type Palette = {
  land: string; landDeep: string; water: string; waterLine: string; park: string; wood: string;
  building: string; buildingTop: string; road: string; roadCase: string; minor: string;
  highway: string; highwayCase: string; rail: string; boundary: string;
  label: string; labelMuted: string; halo: string; waterLabel: string; route: string;
};

const light: Palette = {
  land: "#F1E9DA", landDeep: "#E4D8C0", water: "#A8B9B6", waterLine: "#93A7A4", park: "#C9CFA9", wood: "#BCC49A",
  building: "#E0D3BA", buildingTop: "#D8C9AC", road: "#FBF6EC", roadCase: "#D6C7AA", minor: "#F8F2E6",
  highway: "#E8B98C", highwayCase: "#C98F5E", rail: "#B8A98F", boundary: "#9C8A75",
  label: "#2A2119", labelMuted: "#6B5D4E", halo: "#F1E9DA", waterLabel: "#5E716E", route: "#B5501B",
};

const dark: Palette = {
  land: "#1B1612", landDeep: "#231D18", water: "#2C3735", waterLine: "#3A4744", park: "#2A2E22", wood: "#2E3324",
  building: "#2A231D", buildingTop: "#332A22", road: "#3A3129", roadCase: "#1B1612", minor: "#2F2721",
  highway: "#7A4A2A", highwayCase: "#4A2E1C", rail: "#4A4036", boundary: "#6B5D4E",
  label: "#EDE3D1", labelMuted: "#A99883", halo: "#1B1612", waterLabel: "#8FA3A0", route: "#D2692A",
};

const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];
const FONT_ITALIC = ["Noto Sans Italic"];

function vectorLayers(p: Palette, scale: number, opts: { buildings3d: boolean; labels: boolean; base: boolean }): LayerSpecification[] {
  const name = ["coalesce", ["get", "name:latin"], ["get", "name"]] as unknown as string;
  const roadW = (base: number) =>
    ["interpolate", ["exponential", 1.5], ["zoom"], 6, base * 0.3, 12, base, 18, base * 14] as unknown as number;
  const L: LayerSpecification[] = [];
  if (opts.base) {
    L.push(
      { id: "landcover-wood", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", ["get", "class"], "wood"], paint: { "fill-color": p.wood, "fill-opacity": 0.5 } },
      { id: "landcover-grass", type: "fill", source: "omt", "source-layer": "landcover", filter: ["in", ["get", "class"], ["literal", ["grass", "farmland"]]], paint: { "fill-color": p.park, "fill-opacity": 0.35 } },
      { id: "landuse-res", type: "fill", source: "omt", "source-layer": "landuse", filter: ["in", ["get", "class"], ["literal", ["residential", "suburb", "neighbourhood"]]], paint: { "fill-color": p.landDeep, "fill-opacity": 0.45 } },
      { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": p.park, "fill-opacity": 0.75 } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": p.water } },
      { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": p.waterLine, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 16, 3] } },
    );
    if (!opts.buildings3d) {
      L.push({ id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 14, paint: { "fill-color": p.building, "fill-outline-color": p.roadCase } });
    }
    L.push(
      { id: "boundary", type: "line", source: "omt", "source-layer": "boundary", filter: ["<=", ["get", "admin_level"], 4], paint: { "line-color": p.boundary, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 10, 1.4], "line-dasharray": [3, 2] } },
      { id: "rail", type: "line", source: "omt", "source-layer": "transportation", filter: ["==", ["get", "class"], "rail"], minzoom: 10, paint: { "line-color": p.rail, "line-width": 1, "line-dasharray": [4, 3] } },
      { id: "road-minor-case", type: "line", source: "omt", "source-layer": "transportation", minzoom: 13, filter: ["in", ["get", "class"], ["literal", ["minor", "service", "track"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.roadCase, "line-width": roadW(1.4) } },
      { id: "road-minor", type: "line", source: "omt", "source-layer": "transportation", minzoom: 13, filter: ["in", ["get", "class"], ["literal", ["minor", "service", "track"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.minor, "line-width": roadW(1) } },
      { id: "road-main-case", type: "line", source: "omt", "source-layer": "transportation", minzoom: 8, filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "tertiary"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.roadCase, "line-width": roadW(2.4) } },
      { id: "road-main", type: "line", source: "omt", "source-layer": "transportation", minzoom: 8, filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "tertiary"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.road, "line-width": roadW(1.8) } },
      { id: "road-highway-case", type: "line", source: "omt", "source-layer": "transportation", minzoom: 5, filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.highwayCase, "line-width": roadW(3) } },
      { id: "road-highway", type: "line", source: "omt", "source-layer": "transportation", minzoom: 5, filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk"]]], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.highway, "line-width": roadW(2.2) } },
    );
  }
  if (opts.buildings3d) {
    L.push({
      id: "building-3d", type: "fill-extrusion", source: "omt", "source-layer": "building", minzoom: 14,
      paint: {
        "fill-extrusion-color": p.buildingTop,
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.88,
      },
    });
  }
  if (opts.labels) {
    const halo = opts.base ? p.halo : "#1B1612";
    const lbl = opts.base ? p.label : "#F1E9DA";
    L.push(
      { id: "water-name", type: "symbol", source: "omt", "source-layer": "water_name", layout: { "text-field": name, "text-font": FONT_ITALIC, "text-size": 12 * scale, "text-letter-spacing": 0.15 }, paint: { "text-color": opts.base ? p.waterLabel : lbl, "text-halo-color": halo, "text-halo-width": 1 } },
      { id: "road-name", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 13, layout: { "symbol-placement": "line", "text-field": name, "text-font": FONT, "text-size": 11 * scale }, paint: { "text-color": opts.base ? p.labelMuted : lbl, "text-halo-color": halo, "text-halo-width": 1.4 } },
      { id: "poi", type: "symbol", source: "omt", "source-layer": "poi", minzoom: 16, filter: ["<=", ["get", "rank"], 20], layout: { "text-field": name, "text-font": FONT, "text-size": 11 * scale, "text-max-width": 8 }, paint: { "text-color": opts.base ? p.labelMuted : lbl, "text-halo-color": halo, "text-halo-width": 1.2 } },
      { id: "place-minor", type: "symbol", source: "omt", "source-layer": "place", filter: ["in", ["get", "class"], ["literal", ["village", "suburb", "neighbourhood", "hamlet"]]], minzoom: 11, layout: { "text-field": name, "text-font": FONT, "text-size": 12 * scale }, paint: { "text-color": opts.base ? p.labelMuted : lbl, "text-halo-color": halo, "text-halo-width": 1.4 } },
      { id: "place-town", type: "symbol", source: "omt", "source-layer": "place", filter: ["in", ["get", "class"], ["literal", ["town", "city"]]], layout: { "text-field": name, "text-font": FONT_BOLD, "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11 * scale, 12, 17 * scale] }, paint: { "text-color": lbl, "text-halo-color": halo, "text-halo-width": 1.6 } },
      { id: "place-country", type: "symbol", source: "omt", "source-layer": "place", filter: ["==", ["get", "class"], "country"], maxzoom: 7, layout: { "text-field": name, "text-font": FONT_BOLD, "text-size": 13 * scale, "text-transform": "uppercase", "text-letter-spacing": 0.2 }, paint: { "text-color": opts.base ? p.labelMuted : lbl, "text-halo-color": halo, "text-halo-width": 1.6 } },
    );
  }
  return L;
}

export function buildStyle(mode: MapMode, o: { dark: boolean; buildings3d: boolean; labelScale: number; earthLabels: boolean }): StyleSpecification {
  const p = o.dark ? dark : light;
  const sources: StyleSpecification["sources"] = {
    omt: env.maptiler
      ? { type: "vector", url: `https://api.maptiler.com/tiles/v3-openmaptiles/tiles.json?key=${env.maptiler}` }
      : { type: "vector", url: "https://tiles.openfreemap.org/planet" },
  };
  const style: StyleSpecification = {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources,
    layers: [{ id: "bg", type: "background", paint: { "background-color": p.land } }],
  };

  if (mode === "earth") {
    sources["sat"] = {
      type: "raster", tileSize: 256, maxzoom: 19,
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    };
    style.layers = [
      { id: "bg", type: "background", paint: { "background-color": "#0E0B09" } },
      { id: "sat", type: "raster", source: "sat" },
      ...(o.earthLabels ? vectorLayers(p, o.labelScale, { buildings3d: false, labels: true, base: false }) : []),
    ];
    style.projection = { type: "globe" };
    style.sky = { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] };
    return style;
  }

  const is3d = mode === "3d";
  style.layers.push(...vectorLayers(p, o.labelScale, { buildings3d: is3d && o.buildings3d, labels: true, base: true }));

  if (is3d) {
    sources["dem"] = {
      type: "raster-dem", encoding: "terrarium", tileSize: 256, maxzoom: 14,
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      attribution: "Terrain: Mapzen, AWS Open Data",
    };
    style.terrain = { source: "dem", exaggeration: 1.3 };
    style.sky = {
      "sky-color": o.dark ? "#16120F" : "#E9DDC8",
      "horizon-color": o.dark ? "#2A221B" : "#F1E9DA",
      "fog-color": p.land,
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.5,
      "fog-ground-blend": 0.4,
    };
    style.layers.splice(1, 0, { id: "hillshade", type: "hillshade", source: "dem", paint: { "hillshade-shadow-color": o.dark ? "#000000" : "#6B5D4E", "hillshade-exaggeration": 0.25 } });
  }

  if (mode === "street" && env.mapillary) {
    sources["mly"] = {
      type: "vector", minzoom: 6, maxzoom: 14,
      tiles: [`https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${env.mapillary}`],
      attribution: "Street imagery © Mapillary",
    };
    style.layers.push({
      id: "mly-seq", type: "line", source: "mly", "source-layer": "sequence",
      layout: { "line-cap": "round" },
      paint: { "line-color": p.route, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 16, 3], "line-opacity": 0.75 },
    });
  }

  return style;
}

export const routeColor = (dark: boolean) => (dark ? "#D2692A" : "#B5501B");
export const altRouteColor = (dark: boolean) => (dark ? "#6B5D4E" : "#A39684");
export const routeRimColor = (dark: boolean) => (dark ? "#1B1612" : "#FBF6EC");
export const routeArrowColor = () => "#FBF6EC";

// Traffic belongs below labels and all interactive navigation overlays, even
// when it refreshes or the base style is replaced.
export function orderMapOverlays(map: MLMap) {
  const layers = map.getStyle()?.layers ?? [];
  const firstLabel = layers.find(l => l.type === "symbol" && !l.id.startsWith("meridian-"))?.id;
  if (map.getLayer("live-traffic") && firstLabel) map.moveLayer("live-traffic", firstLabel);
  for (const id of ["meridian-route-case", "meridian-route-line", "meridian-route-arrows", "meridian-clusters", "meridian-cluster-count", "meridian-markers", "meridian-marker-labels", "meridian-me-halo", "meridian-me"]) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}
