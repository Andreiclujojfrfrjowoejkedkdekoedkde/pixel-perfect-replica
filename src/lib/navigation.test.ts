import { describe, expect, it } from "vitest";
import { approachText, laneAdvice, OFF_ROUTE_METRES, routeProgress } from "./navigation";
import { parseMaxspeed } from "./speedLimits";
import type { Maneuver, Route } from "./services";

const m = (over: Partial<Maneuver>): Maneuver => ({
  instruction: "Continue",
  type: 1,
  street: "Main St",
  length: 100,
  time: 10,
  beginIndex: 0,
  ...over,
});

/** A straight north-south route: 100 vertices, one hundredth of a degree apart. */
const SEGMENT_METRES = 111.32; // one hundredth of a degree of latitude
const straightRoute = (): Route => ({
  coords: Array.from({ length: 100 }, (_, i) => [23.0, 46.0 + i * 0.001]),
  distance: 99 * SEGMENT_METRES,
  duration: 600,
  maneuvers: [
    m({ beginIndex: 0, length: 4000 }),
    m({ beginIndex: 40, instruction: "Turn right", type: 3, length: 99 * SEGMENT_METRES - 4000 }),
  ],
});

describe("laneAdvice", () => {
  it("turns Valhalla types into plain language", () => {
    expect(laneAdvice(m({ type: 3 })).text).toMatch(/right/i);
    expect(laneAdvice(m({ type: 2 })).text).toMatch(/left/i);
    expect(laneAdvice(m({ type: 17 })).side).toBe("uturn");
  });

  it("reports which side to keep", () => {
    expect(laneAdvice(m({ type: 24 })).side).toBe("left");
    expect(laneAdvice(m({ type: 23 })).side).toBe("right");
    expect(laneAdvice(m({ type: 13 })).side).toBe("right");
  });

  it("says nothing rather than guessing an unknown type", () => {
    expect(laneAdvice(m({ type: 999 })).text).toBeNull();
    expect(laneAdvice(undefined).text).toBeNull();
  });

  it("renders an approach line in the driver's units", () => {
    const advice = laneAdvice(m({ type: 3 }));
    expect(approachText(advice, 200, "metric")).toBe("Turn right in 200 m");
    expect(approachText(advice, 1609, "imperial")).toBe("Turn right in 1.0 mi");
    expect(approachText(advice, 91, "imperial")).toBe("Turn right in 300 ft");
  });
});

describe("routeProgress", () => {
  it("finds the position on the route and measures what is left", () => {
    const route = straightRoute();
    // Third vertex of the route.
    const p = routeProgress(route, 23.0, 46.002, null);
    expect(p.offRoute).toBeLessThan(OFF_ROUTE_METRES);
    expect(p.remaining).toBeGreaterThan(0);
    expect(p.remaining).toBeLessThan(route.distance);
  });

  it("reports how far off route the driver is", () => {
    const route = straightRoute();
    const on = routeProgress(route, 23.0, 46.002, null);
    const off = routeProgress(route, 23.01, 46.002, null);
    expect(on.offRoute).toBeLessThan(off.offRoute);
    expect(off.offRoute).toBeGreaterThan(OFF_ROUTE_METRES);
  });

  it("reports monotonically increasing progress", () => {
    const route = straightRoute();
    const a = routeProgress(route, 23.0, 46.001, null);
    const b = routeProgress(route, 23.0, 46.005, null);
    expect(b.travelled).toBeGreaterThan(a.travelled);
    expect(b.remaining).toBeLessThan(a.remaining);
    expect(b.fraction).toBeGreaterThan(a.fraction);
    expect(b.fraction).toBeLessThanOrEqual(1);
  });

  it("points at the next manoeuvre and the distance to it", () => {
    const route = straightRoute();
    const p = routeProgress(route, 23.0, 46.001, null);
    expect(p.next.type).toBe(3);
    expect(p.toNext).toBeGreaterThan(0);
  });

  it("is finished at the end of the route", () => {
    const route = straightRoute();
    const p = routeProgress(route, 23.0, 46.099, null);
    expect(p.remaining).toBeLessThan(200);
  });

  it("uses the compass heading when there is one", () => {
    const route = straightRoute();
    expect(routeProgress(route, 23.0, 46.002, 137).bearing).toBe(137);
  });

  it("never divides by zero on a zero-length route", () => {
    const degenerate: Route = { coords: [[23, 46]], distance: 0, duration: 0, maneuvers: [] };
    const p = routeProgress(degenerate, 23, 46, null);
    expect(Number.isFinite(p.fraction)).toBe(true);
    expect(Number.isFinite(p.timeLeft)).toBe(true);
  });

  it("reuses the shared maxspeed parser so units stay consistent", () => {
    expect(parseMaxspeed("50 mph")).toBe(80);
  });
});
