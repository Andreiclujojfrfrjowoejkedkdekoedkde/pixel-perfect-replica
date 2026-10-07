import { beforeEach, describe, expect, it } from "vitest";
import { routeKey, storedRoutes } from "./routeStore";
import type { Route } from "./services";

const route = (n: number): Route => ({
  coords: Array.from({ length: n }, (_, i) => [23 + i * 0.001, 46]) as [number, number][],
  distance: 1000,
  duration: 600,
  maneuvers: [],
});

const A: [number, number] = [23.0, 46.0];
const B: [number, number] = [23.5, 46.5];

beforeEach(() => {
  storedRoutes.clear();
});

describe("routeKey", () => {
  it("is stable for the same endpoints and mode", () => {
    expect(routeKey(A, B, "drive")).toBe(routeKey(A, B, "drive"));
  });

  it("differs by mode", () => {
    expect(routeKey(A, B, "drive")).not.toBe(routeKey(A, B, "walk"));
  });

  it("differs by endpoint", () => {
    expect(routeKey(A, B, "drive")).not.toBe(routeKey(B, A, "drive"));
  });

  it("tolerates small GPS noise by rounding", () => {
    expect(routeKey(A, [23.5000001, 46.5000001], "drive")).toBe(routeKey(A, B, "drive"));
  });
});

describe("storedRoutes", () => {
  it("starts empty", () => {
    expect(storedRoutes.all()).toEqual([]);
    expect(storedRoutes.find(A, B, "drive")).toBeNull();
  });

  it("stores and finds a route", () => {
    storedRoutes.put({
      key: routeKey(A, B, "drive"),
      route: route(10),
      mode: "drive",
      originLabel: "Home",
      destinationLabel: "Work",
    });
    expect(storedRoutes.find(A, B, "drive")?.destinationLabel).toBe("Work");
  });

  it("matches in either direction, so a return trip is covered", () => {
    storedRoutes.put({
      key: routeKey(A, B, "drive"),
      route: route(10),
      mode: "drive",
      originLabel: "Home",
      destinationLabel: "Work",
    });
    expect(storedRoutes.find(B, A, "drive")?.originLabel).toBe("Home");
  });

  it("does not return a route for a different mode", () => {
    storedRoutes.put({
      key: routeKey(A, B, "drive"),
      route: route(10),
      mode: "drive",
      originLabel: "a",
      destinationLabel: "b",
    });
    expect(storedRoutes.find(A, B, "walk")).toBeNull();
  });

  it("replaces rather than duplicating the same key", () => {
    for (const label of ["first", "second"]) {
      storedRoutes.put({
        key: routeKey(A, B, "drive"),
        route: route(10),
        mode: "drive",
        originLabel: "a",
        destinationLabel: label,
      });
    }
    const all = storedRoutes.all();
    expect(all).toHaveLength(1);
    expect(all[0]?.destinationLabel).toBe("second");
  });

  it("counts drives and floats the most used route to the top", () => {
    const other: [number, number] = [24, 47];
    storedRoutes.put({
      key: routeKey(A, B, "drive"),
      route: route(10),
      mode: "drive",
      originLabel: "a",
      destinationLabel: "b",
    });
    storedRoutes.put({
      key: routeKey(other, B, "drive"),
      route: route(10),
      mode: "drive",
      originLabel: "c",
      destinationLabel: "d",
    });
    const k = routeKey(A, B, "drive");
    storedRoutes.markDriven(k);
    storedRoutes.markDriven(k);
    expect(storedRoutes.get(k)?.timesDriven).toBe(2);
    expect(storedRoutes.all()[0]?.key).toBe(k);
  });

  it("removes a single route and clears them all", () => {
    storedRoutes.put({
      key: routeKey(A, B, "drive"),
      route: route(10),
      mode: "drive",
      originLabel: "a",
      destinationLabel: "b",
    });
    storedRoutes.remove(routeKey(A, B, "drive"));
    expect(storedRoutes.all()).toEqual([]);
    storedRoutes.put({
      key: routeKey(A, B, "drive"),
      route: route(10),
      mode: "drive",
      originLabel: "a",
      destinationLabel: "b",
    });
    storedRoutes.clear();
    expect(storedRoutes.all()).toEqual([]);
  });
});
