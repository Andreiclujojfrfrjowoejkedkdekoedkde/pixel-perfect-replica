import { describe, expect, it } from "vitest";
import {
  hasMaxspeed,
  limitAtIndex,
  limitForDirection,
  parseMaxspeed,
  projectSpeedLimits,
  routeKey,
  type MaxspeedWay,
} from "./speedLimits";

const straight = (n: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => [23.0 + i * 0.001, 46.0]);

describe("parseMaxspeed", () => {
  it("reads a bare number as km/h, which is what OSM means", () => {
    expect(parseMaxspeed("50")).toBe(50);
    expect(parseMaxspeed(" 30 ")).toBe(30);
  });

  it("reads explicit metric units", () => {
    expect(parseMaxspeed("50 km/h")).toBe(50);
    expect(parseMaxspeed("50kph")).toBe(50);
    expect(parseMaxspeed("80 kmh")).toBe(80);
  });

  it("converts mph to km/h", () => {
    expect(parseMaxspeed("50 mph")).toBe(80);
    expect(parseMaxspeed("25mi/h")).toBe(40);
  });

  it("takes the first value from a multi-value tag", () => {
    expect(parseMaxspeed("50;30")).toBe(50);
  });

  it("treats signals, none and other non-numeric values as unknown", () => {
    for (const raw of ["signals", "none", "walk", "variable", "DE:urban", "", "unknown"]) {
      expect(parseMaxspeed(raw)).toBeNull();
    }
    expect(parseMaxspeed(undefined)).toBeNull();
  });

  it("rejects nonsense numbers", () => {
    expect(parseMaxspeed("0")).toBeNull();
    expect(parseMaxspeed("-50")).toBeNull();
  });
});

describe("directional limits", () => {
  it("prefers the tag for the direction of travel", () => {
    const tags = { "maxspeed:forward": "90", "maxspeed:backward": "60" };
    expect(limitForDirection(tags, "forward")).toBe(90);
    expect(limitForDirection(tags, "backward")).toBe(60);
  });

  it("falls back to the plain tag", () => {
    expect(limitForDirection({ maxspeed: "70" }, "forward")).toBe(70);
    expect(limitForDirection({ maxspeed: "70" }, "backward")).toBe(70);
  });

  it("ignores a directional tag that carries no number", () => {
    const tags = { maxspeed: "70", "maxspeed:forward": "signals" };
    expect(limitForDirection(tags, "forward")).toBe(70);
  });

  it("reports unknown when nothing parses", () => {
    expect(limitForDirection({ maxspeed: "signals" }, "forward")).toBeNull();
    expect(limitForDirection(undefined, "forward")).toBeNull();
    expect(hasMaxspeed({ maxspeed: "signals" })).toBe(true);
    expect(hasMaxspeed({ name: "Main St" })).toBe(false);
  });
});

describe("projectSpeedLimits", () => {
  const way = (
    id: number,
    tags: Record<string, string>,
    geometry: [number, number][],
  ): MaxspeedWay => ({
    id,
    tags,
    geometry: geometry.map(([lon, lat]) => ({ lon, lat })),
  });

  it("emits one sign per change of posted limit", () => {
    const route = straight(200);
    const { signs } = projectSpeedLimits(
      [
        way(1, { maxspeed: "50" }, [
          [23.0005, 46.0],
          [23.0015, 46.0],
        ]),
        way(2, { maxspeed: "90" }, [
          [23.01, 46.0],
          [23.011, 46.0],
        ]),
        way(3, { maxspeed: "90" }, [
          [23.015, 46.0],
          [23.016, 46.0],
        ]),
      ],
      route,
    );
    expect(signs.map((s) => s.limitKmh)).toEqual([50, 90]);
  });

  it("keeps a stretch with no usable tag as explicitly unknown", () => {
    const route = straight(200);
    const { segments, signs } = projectSpeedLimits(
      [
        way(1, { maxspeed: "50" }, [
          [23.0005, 46.0],
          [23.0015, 46.0],
        ]),
        way(2, { maxspeed: "signals" }, [
          [23.005, 46.0],
          [23.006, 46.0],
        ]),
      ],
      route,
    );
    expect(signs.map((s) => s.limitKmh)).toEqual([50]);
    expect(limitAtIndex(segments, 1)).toBe(50);
    expect(limitAtIndex(segments, 60)).toBeNull();
  });

  it("reports unknown before the first tagged way and after the last one", () => {
    const route = straight(200);
    const { segments } = projectSpeedLimits(
      [
        way(1, { maxspeed: "50" }, [
          [23.005, 46.0],
          [23.006, 46.0],
        ]),
      ],
      route,
    );
    expect(limitAtIndex(segments, 0)).toBeNull();
    expect(limitAtIndex(segments, 55)).toBe(50);
    expect(limitAtIndex(segments, 199)).toBe(50);
  });

  it("ignores ways that sit far from the route", () => {
    const { signs } = projectSpeedLimits(
      [
        way(1, { maxspeed: "30" }, [
          [24.0, 46.5],
          [24.001, 46.5],
        ]),
      ],
      straight(200),
    );
    expect(signs).toEqual([]);
  });

  it("uses maxspeed:backward when the route runs against the way's node order", () => {
    const route = straight(200);
    const tags = { "maxspeed:forward": "90", "maxspeed:backward": "50" };
    const forward = projectSpeedLimits(
      [
        way(1, tags, [
          [23.0005, 46.0],
          [23.0015, 46.0],
        ]),
      ],
      route,
    );
    const backward = projectSpeedLimits(
      [
        way(1, tags, [
          [23.0015, 46.0],
          [23.0005, 46.0],
        ]),
      ],
      route,
    );
    expect(forward.signs[0]?.limitKmh).toBe(90);
    expect(backward.signs[0]?.limitKmh).toBe(50);
  });

  it("keys a route cache by its ends and length", () => {
    expect(routeKey(straight(10))).toBe(routeKey(straight(10)));
    expect(routeKey(straight(10))).not.toBe(routeKey(straight(11)));
  });
});
