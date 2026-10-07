import { describe, expect, it } from "vitest";
import {
  extractJson,
  expiryFor,
  EXPIRY_HOURS,
  HAZARD_CATEGORIES,
  hazardSchema,
  MAX_REPORT_CHARS,
  parseHazardReply,
} from "./hazards";

describe("hazard schema", () => {
  it("accepts a well-formed reply", () => {
    const parsed = hazardSchema.parse({
      category: "pothole",
      severity: "medium",
      location_summary: "on Strada Victoriei near Piata Sud",
      impact_summary: "Pothole in the left lane, slow down.",
      confidence: 0.82,
    });
    expect(parsed.category).toBe("pothole");
    expect(parsed.confidence).toBeCloseTo(0.82);
  });

  it("rejects a category outside the allowed list", () => {
    expect(
      hazardSchema.safeParse({ category: "wildlife", severity: "low", confidence: 0.5 }).success,
    ).toBe(false);
  });

  it("rejects a severity outside the allowed list", () => {
    expect(hazardSchema.safeParse({ category: "pothole", severity: "urgent" }).success).toBe(false);
  });

  it("clamps a stringified or out-of-range confidence", () => {
    expect(
      hazardSchema.parse({ category: "other", severity: "low", confidence: "0.4" }).confidence,
    ).toBeCloseTo(0.4);
    expect(
      hazardSchema.safeParse({ category: "other", severity: "low", confidence: 9 }).success,
    ).toBe(false);
  });

  it("caps over-long summaries", () => {
    const long = hazardSchema.safeParse({
      category: "debris",
      severity: "low",
      impact_summary: "x".repeat(500),
    });
    expect(long.success).toBe(false);
  });
});

describe("extractJson", () => {
  it("pulls JSON out of a fenced block", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it("pulls JSON out of surrounding prose", () => {
    expect(extractJson('Sure! Here it is: {"a":3} Hope that helps.')).toEqual({ a: 3 });
  });

  it("throws when there is no object at all", () => {
    expect(() => extractJson("I could not classify this.")).toThrow();
  });
});

describe("parseHazardReply", () => {
  it("parses a valid reply and flags it as parsed", () => {
    const out = parseHazardReply(
      '{"category":"flooding","severity":"high","location_summary":"under the bridge","impact_summary":"Water across both lanes.","confidence":0.9}',
      "lots of water",
    );
    expect(out.parsed).toBe(true);
    expect(out.category).toBe("flooding");
    expect(out.severity).toBe("high");
  });

  it("strips code fences before parsing", () => {
    const out = parseHazardReply(
      '```json\n{"category":"animal","severity":"low","location_summary":"","impact_summary":"Deer on the verge.","confidence":0.6}\n```',
      "deer",
    );
    expect(out.parsed).toBe(true);
    expect(out.category).toBe("animal");
  });

  it("falls back to other with the raw text when parsing fails", () => {
    const out = parseHazardReply("total nonsense", "tree down blocking the lane");
    expect(out.parsed).toBe(false);
    expect(out.category).toBe("other");
    expect(out.impact_summary).toBe("tree down blocking the lane");
    expect(out.confidence).toBe(0);
  });

  it("falls back when the model invents a category", () => {
    const out = parseHazardReply('{"category":"aliens","severity":"low"}', "something odd");
    expect(out.parsed).toBe(false);
    expect(out.category).toBe("other");
  });
});

describe("expiry", () => {
  it("expires transient categories sooner than lasting ones", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const debris = Date.parse(expiryFor("debris", now));
    const works = Date.parse(expiryFor("road_work", now));
    expect(debris - now.getTime()).toBe(EXPIRY_HOURS.debris * 3600_000);
    expect(debris).toBeLessThan(works);
  });

  it("gives every category an expiry", () => {
    for (const c of HAZARD_CATEGORIES) {
      expect(EXPIRY_HOURS[c]).toBeGreaterThan(0);
    }
  });

  it("caps a report at 500 characters", () => {
    expect(MAX_REPORT_CHARS).toBe(500);
  });
});
