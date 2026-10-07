// Shared hazard vocabulary and validation. Imported by both the server function
// and the client, so the shapes the model is asked for and the shapes the UI
// edits can never drift apart.

import { z } from "zod";

export const HAZARD_CATEGORIES = [
  "accident",
  "debris",
  "pothole",
  "flooding",
  "ice_snow",
  "stalled_vehicle",
  "road_work",
  "animal",
  "police",
  "other",
] as const;
export type HazardCategory = (typeof HAZARD_CATEGORIES)[number];

export const HAZARD_SEVERITIES = ["low", "medium", "high"] as const;
export type HazardSeverity = (typeof HAZARD_SEVERITIES)[number];

export const CATEGORY_LABEL: Record<HazardCategory, string> = {
  accident: "Accident",
  debris: "Loose debris",
  pothole: "Pothole",
  flooding: "Flooding",
  ice_snow: "Ice or snow",
  stalled_vehicle: "Broken-down vehicle",
  road_work: "Road works",
  animal: "Animal on the road",
  police: "Police activity",
  other: "Something else",
};

export const CATEGORY_HINT: Record<HazardCategory, string> = {
  accident: "Collision or crash on the carriageway",
  debris: "Objects or rubbish in the lane",
  pothole: "Road surface damage",
  flooding: "Standing or deep water",
  ice_snow: "Ice, snow or black ice",
  stalled_vehicle: "Vehicle broken down or parked in a live lane",
  road_work: "Works, coning or a lane closure",
  animal: "Animal loose or on the road",
  police: "Police or emergency services at the scene",
  other: "Anything not covered above",
};

export const SEVERITY_LABEL: Record<HazardSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Strict JSON the server function validates the model's reply against. */
export const hazardSchema = z.object({
  category: z.enum(HAZARD_CATEGORIES),
  severity: z.enum(HAZARD_SEVERITIES),
  /** Short location description built from the reverse-geocoded road. */
  location_summary: z.string().trim().max(160).default(""),
  /** One sentence telling nearby drivers what to expect. */
  impact_summary: z.string().trim().max(240).default(""),
  /** Model's own confidence, 0..1. */
  confidence: z.coerce.number().min(0).max(1).default(0.5),
});

export type HazardDraft = z.infer<typeof hazardSchema>;

export const MAX_REPORT_CHARS = 500;

/** Strip code fences and surrounding prose so only the JSON object remains. */
export function extractJson(raw: string): unknown {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(raw);
  const body = fenced?.[1]?.trim() ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in the reply.");
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * Turn a raw model reply into a draft. Any failure degrades to "other" carrying
 * the driver's own words, so a report is never lost because parsing failed.
 */
export function parseHazardReply(
  raw: string,
  fallbackText: string,
): HazardDraft & { parsed: boolean } {
  try {
    const parsed = hazardSchema.parse(extractJson(raw));
    return { ...parsed, parsed: true };
  } catch {
    return {
      category: "other",
      severity: "medium",
      location_summary: "",
      impact_summary: fallbackText.trim().slice(0, 240),
      confidence: 0,
      parsed: false,
    };
  }
}

/**
 * How long a report should stay live. Things that clear themselves go first, so a
 * stale "ice" warning never lingers after the road is fine.
 */
export const EXPIRY_HOURS: Record<HazardCategory, number> = {
  pothole: 6,
  debris: 2,
  ice_snow: 3,
  flooding: 4,
  animal: 2,
  stalled_vehicle: 3,
  police: 2,
  accident: 4,
  road_work: 12,
  other: 2,
};

export const DEFAULT_EXPIRY_HOURS = 2;

export function expiryFor(category: HazardCategory, from = new Date()): string {
  const hours = EXPIRY_HOURS[category] ?? DEFAULT_EXPIRY_HOURS;
  return new Date(from.getTime() + hours * 3600_000).toISOString();
}

/** Hazards further ahead than this on the route are not worth interrupting for. */
export const AHEAD_BANNER_METRES = 2000;
