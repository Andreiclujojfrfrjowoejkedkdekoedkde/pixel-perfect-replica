import { describe, expect, it } from "vitest";
import {
  estimate,
  fmtBytes,
  MAX_TILES,
  MAX_ZOOM,
  pointInPolygon,
  searchIndex,
  tilesFor,
} from "./offlineTiles";
import { covers, type OfflineArea, type OfflinePlace } from "./offlineDb";

const place = (over: Partial<OfflinePlace>): OfflinePlace => ({
  id: "N1",
  areaId: "a",
  name: "Cafe Central",
  subtitle: "Strada Independentei",
  kind: "cafe",
  lon: 23.5,
  lat: 46.5,
  s: "cafe central strada independentei cafe",
  ...over,
});

describe("tile maths", () => {
  it("counts every tile covering the bbox", () => {
    const tiny = tilesFor([0, 0, 0.01, 0.01], 10, 10);
    expect(tiny.length).toBeGreaterThan(0);
    expect(tiny.every(([z]) => z === 10)).toBe(true);
  });

  it("grows sharply with zoom, which is why the max zoom is capped", () => {
    const bbox: [number, number, number, number] = [23.5, 46.5, 23.52, 46.52];
    const low = tilesFor(bbox, 10, 11).length;
    const high = tilesFor(bbox, 10, 14).length;
    expect(high).toBeGreaterThan(low);
  });

  it("never returns more than the tile cap", () => {
    // A deliberately enormous area at full detail.
    const tiles = tilesFor([-180, -85, 180, 85], 0, MAX_ZOOM);
    expect(tiles.length).toBeLessThanOrEqual(MAX_TILES);
  });

  it("only keeps tiles the drawn shape touches", () => {
    // A quarter-size shape inside a wider bbox, at a zoom where tiles are coarse
    // enough that the shape covers a few of them.
    const bbox: [number, number, number, number] = [0, 0, 2.8, 2.8];
    const polygon: [number, number][] = [
      [0, 0],
      [1.4, 0],
      [1.4, 1.4],
      [0, 1.4],
    ];
    const all = tilesFor(bbox, 8, 8);
    const inside = tilesFor(bbox, 8, 8, polygon);
    expect(all.length).toBeGreaterThan(4);
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.length).toBeLessThan(all.length);
  });

  it("keeps every tile when the shape covers the whole bbox", () => {
    const bbox: [number, number, number, number] = [23.5, 46.5, 23.52, 46.52];
    const polygon: [number, number][] = [
      [23.5, 46.5],
      [23.52, 46.5],
      [23.52, 46.52],
      [23.5, 46.52],
    ];
    expect(tilesFor(bbox, 12, 12, polygon)).toEqual(tilesFor(bbox, 12, 12));
  });

  it("does an even-odd point in polygon test", () => {
    const square: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(pointInPolygon([0.5, 0.5], square)).toBe(true);
    expect(pointInPolygon([1.5, 0.5], square)).toBe(false);
  });
});

describe("estimate", () => {
  it("refuses an area larger than the cap and explains why", () => {
    const est = estimate([-180, -85, 180, 85], MAX_ZOOM);
    expect(est.tooWide).toBe(true);
    expect(est.warning).toMatch(/cap|limit/i);
  });

  it("warns without blocking on a merely large area", () => {
    // ~2,100 km² and ~4,000 tiles: allowed, but worth warning about.
    const est = estimate([23.3, 46.3, 23.8, 46.8], MAX_ZOOM);
    expect(est.tooWide).toBe(false);
    expect(est.tiles).toBeGreaterThan(2500);
    expect(est.warning).toMatch(/large download/i);
  });

  it("gives a size estimate for a normal city", () => {
    const est = estimate([23.5, 46.5, 23.51, 46.51], 14);
    expect(est.tiles).toBeGreaterThan(0);
    expect(est.bytes).toBeGreaterThan(0);
    expect(est.warning).toBeNull();
  });
});

describe("fmtBytes", () => {
  it("formats sizes a driver can read", () => {
    expect(fmtBytes(0)).toBe("0 MB");
    expect(fmtBytes(2048)).toBe("2 KB");
    expect(fmtBytes(5 * 1048576)).toBe("5.0 MB");
    expect(fmtBytes(2 * 1073741824)).toBe("2.0 GB");
  });
});

describe("offline search index", () => {
  const places = [
    place({ id: "N1", name: "Central Cafe", s: "central cafe strada independentei cafe" }),
    place({ id: "N2", name: "Central Library", s: "central library strada republicii" }),
    place({ id: "N3", name: "Petal Pharmacy", s: "petal pharmacy strada pacii" }),
    place({ id: "N4", name: "Big Bolero Restaurant", s: "big bolero restaurant" }),
  ];

  it("ranks an exact name first", () => {
    expect(searchIndex(places, "Central Cafe")[0]?.name).toBe("Central Cafe");
  });

  it("matches on a prefix", () => {
    expect(searchIndex(places, "cent").map((p) => p.name)).toContain("Central Library");
  });

  it("matches on a substring of the wider haystack", () => {
    expect(searchIndex(places, "republicii").map((p) => p.name)).toContain("Central Library");
  });

  it("tolerates a typo", () => {
    expect(searchIndex(places, "pharmcy")[0]?.name).toBe("Petal Pharmacy");
  });

  it("matches multi-word queries", () => {
    expect(searchIndex(places, "central library")[0]?.name).toBe("Central Library");
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchIndex(places, "zzzzz")).toEqual([]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchIndex(places, "   ")).toEqual([]);
  });

  it("prefers the closer match when the origin is supplied", () => {
    const hits = searchIndex(places, "central", [23.5, 46.5]);
    expect(hits[0]?.id).toBe("N1");
  });
});

describe("covers", () => {
  const area = (bbox: [number, number, number, number]): OfflineArea => ({
    id: "a",
    name: "A",
    kind: "search",
    bbox,
    minZoom: 0,
    maxZoom: 14,
    tiles: 1,
    bytes: 1,
    done: 1,
    state: "ready",
    placeCount: 0,
    cacheName: "meridian-area-a",
    date: new Date().toISOString(),
  });

  it("covers a viewport inside the area", () => {
    expect(covers(area([23, 46, 24, 47]), [23.4, 46.4, 23.6, 46.6])).toBe(true);
  });

  it("does not cover a viewport outside the area", () => {
    expect(covers(area([23, 46, 24, 47]), [10, 10, 11, 11])).toBe(false);
  });

  it("does not claim a viewport that mostly sits outside", () => {
    expect(covers(area([23, 46, 24, 47]), [23, 46, 30, 47])).toBe(false);
  });
});
