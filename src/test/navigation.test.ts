import { describe, expect, it } from "vitest";
import { nearestOnLine } from "../lib/format";
import { regionArea, inside } from "../lib/offline-data";
describe("Navigation geometry", () => {
  it("snaps a midway point to a sparse road without a false off-route distance", () => {
    const p = nearestOnLine([23.6,46.77], [[23.59,46.77],[23.61,46.77]]);
    expect(p.distance).toBeLessThan(1);
    expect(p.fraction).toBeCloseTo(0.5);
    expect(p.along/p.total).toBeCloseTo(0.5);
  });
  it("uses region bounds and area caps", () => {
    expect(inside([23.6,46.77],[23.5,46.7,23.7,46.8])).toBe(true);
    expect(inside([24,46.77],[23.5,46.7,23.7,46.8])).toBe(false);
    expect(regionArea([23.5,46.7,23.7,46.8])).toBeGreaterThan(100);
  });
});
