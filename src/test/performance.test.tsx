import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapProvider, useMapState } from "../components/map/MapContext";
import { MapCanvas } from "../components/map/MapCanvas";

const canvas = vi.hoisted(() => ({ state: null as unknown, map: null as unknown, order: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../components/map/MapContext", async importOriginal => ({
  ...await importOriginal<typeof import("../components/map/MapContext")>(),
  useMapState: () => canvas.state,
}));
vi.mock("../lib/settings", () => ({
  env: {}, useSettings: () => ({ dark: false, settings: { buildings3d: true, labelScale: 1, earthLabels: true, units: "metric" } }),
}));
vi.mock("../lib/mapStyle", () => ({ buildStyle: () => ({}), routeColor: () => "color", altRouteColor: () => "alt", routeRimColor: () => "rim", routeArrowColor: () => "arrow", orderMapOverlays: canvas.order }));
vi.mock("maplibre-gl", () => ({ Map: class { constructor() { return canvas.map as object; } }, ScaleControl: class {} }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Map performance", () => {
  it("updates only the position source on GPS ticks and restores sources after style changes", async () => {
    const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    const layers = new Set<string>();
    const map = {
      addControl: vi.fn(), on: vi.fn(), remove: vi.fn(), setStyle: vi.fn(), easeTo: vi.fn(),
      getStyle: () => ({ layers: [] }), getZoom: () => 12,
      getSource: (id: string) => sources.get(id),
      addSource: (id: string) => sources.set(id, { setData: vi.fn() }),
      getLayer: (id: string) => layers.has(id),
      addLayer: (layer: { id: string }) => layers.add(layer.id),
    };
    canvas.map = map;
    const state = {
      map, mode: "standard", pickPoint: null, setMap: vi.fn(), bumpStyle: vi.fn(),
      styleVersion: 0, routes: [{ coords: [[23.5, 46.7], [23.6, 46.8]] }], activeRoute: 0,
      markers: [{ id: "cafe", name: "Cafe", lon: 23.6, lat: 46.8 }],
      position: { lon: 23.5, lat: 46.7, accuracy: 5 },
    };
    canvas.state = state;
    const view = render(<MapCanvas />);
    await act(async () => {});
    const route = sources.get("meridian-route");
    const markers = sources.get("meridian-markers");
    const position = sources.get("meridian-me");
    canvas.order.mockClear();
    for (let i = 0; i < 5; i++) {
      canvas.state = { ...state, position: { ...state.position, lon: 23.5 + i / 1000 } };
      view.rerender(<MapCanvas />);
    }
    expect(route?.setData).not.toHaveBeenCalled();
    expect(markers?.setData).not.toHaveBeenCalled();
    expect(position?.setData).toHaveBeenCalledTimes(5);
    expect(canvas.order).not.toHaveBeenCalled();
    sources.clear(); layers.clear();
    canvas.state = { ...state, styleVersion: 1 };
    view.rerender(<MapCanvas />);
    expect(sources.size).toBe(3);
    expect(layers.has("meridian-route-line")).toBe(true);
    expect(canvas.order).toHaveBeenCalledTimes(1);
  });
});