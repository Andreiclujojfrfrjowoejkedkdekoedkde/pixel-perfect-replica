import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as MLMap } from "maplibre-gl";
import { orderMapOverlays } from "../lib/mapStyle";
import { overpass } from "../lib/offline-data";
import { nearbyCategory } from "../lib/services";

afterEach(() => { vi.unstubAllGlobals(); });

describe("Map improvements", () => {
  it("keeps town names above routes after traffic refresh", () => {
    const layers = [
      { id: "road", type: "line" }, { id: "place-town", type: "symbol" },
      { id: "meridian-route-case", type: "line" }, { id: "meridian-route-line", type: "line" },
      { id: "meridian-me", type: "circle" }, { id: "live-traffic", type: "raster" },
    ];
    const map = {
      getStyle: () => ({ layers }), getLayer: (id: string) => layers.find(l => l.id === id),
      moveLayer: (id: string, before?: string) => {
        const index = layers.findIndex(l => l.id === id);
        const [layer] = layers.splice(index, 1);
        if (!layer) return;
        const target = before ? layers.findIndex(l => l.id === before) : -1;
        if (target < 0) layers.push(layer); else layers.splice(target, 0, layer);
      },
    } as unknown as MLMap;
    orderMapOverlays(map); orderMapOverlays(map);
    const ids = layers.map(l => l.id);
    expect(ids.indexOf("live-traffic")).toBeLessThan(ids.indexOf("meridian-route-line"));
    expect(ids.indexOf("meridian-route-line")).toBeLessThan(ids.indexOf("place-town"));
  });

  it("does not wait for a failed first places provider", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("Busy", { status: 429 }))
      .mockResolvedValue(new Response(JSON.stringify({ elements: [{ id: 1 }] })));
    vi.stubGlobal("fetch", fetcher);
    expect((await overpass("query", undefined, true)).elements).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("cancels an obsolete viewport search", async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(overpass("query", controller.signal, true)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reuses full results for a smaller viewport without another request", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("No downloads"); } });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ elements: [
      { type: "node", id: 91, lon: 23.6, lat: 46.77, tags: { name: "Real cafe", amenity: "cafe" } },
      { type: "node", id: 92, lon: 23.69, lat: 46.79, tags: { name: "Outer cafe", amenity: "cafe" } },
    ] })));
    vi.stubGlobal("fetch", fetcher);
    expect(await nearbyCategory("food", '["amenity"="cafe"]', [23.5, 46.7, 23.7, 46.8])).toHaveLength(2);
    expect(await nearbyCategory("food", '["amenity"="cafe"]', [23.59, 46.76, 23.61, 46.78])).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});