import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import { useMapState } from "@/components/map/MapContext";
import { haversine, projectOnLine } from "./format";
import {
  AHEAD_BANNER_METRES,
  expiryFor,
  MAX_REPORT_CHARS,
  type HazardCategory,
  type HazardSeverity,
} from "./hazards";
import { reverseGeocode } from "./services";

export type HazardRow = {
  id: string;
  user_id: string;
  lat: number;
  lon: number;
  category: HazardCategory;
  severity: HazardSeverity;
  summary: string;
  location_summary: string;
  confidence: number | null;
  raw_text: string;
  created_at: string;
  expires_at: string;
};

export type Hazard = HazardRow & { mine: boolean };

export type HazardDraft = {
  category: HazardCategory;
  severity: HazardSeverity;
  summary: string;
  location_summary: string;
  confidence: number;
};

export type HazardNotice = { hazard: Hazard; aheadMetres: number } | null;

type HazardState = {
  hazards: Hazard[];
  /** Closest live hazard within the banner radius, ahead on the active route. */
  notice: HazardNotice;
  dismissNotice: () => void;
  post: (input: { text: string; draft: HazardDraft }) => Promise<{ error: string | null }>;
  withdraw: (id: string) => Promise<void>;
};

const EMPTY: HazardState = {
  hazards: [],
  notice: null,
  dismissNotice: () => {},
  post: async () => ({ error: null }),
  withdraw: async () => {},
};
const Ctx = createContext<HazardState>(EMPTY);

const isLive = (h: HazardRow) => Date.parse(h.expires_at) > Date.now();

/**
 * Community road hazards. Reports are read-only for other drivers, mutable only
 * by their author, and every row has an expiry so nothing stale lingers on the
 * map. Realtime keeps other drivers up to date as reports come in.
 */
export function HazardProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const { routes, activeRoute, position } = useMapState();
  const [rows, setRows] = useState<HazardRow[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (status !== "signed-in" || !userId) {
      setRows([]);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from("road_hazards")
        .select("*")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(300);
      if (data) setRows(data as HazardRow[]);
    };
    void load();

    const channel: RealtimeChannel = supabase
      .channel("meridian-hazards")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "road_hazards" },
        (payload) => {
          const row = (
            payload.eventType === "DELETE" ? payload.old : payload.new
          ) as Partial<HazardRow> | null;
          const id = row?.id;
          if (!id) return;
          setRows((prev) => {
            const rest = prev.filter((h) => h.id !== id);
            if (payload.eventType === "DELETE" || !row.expires_at || !isLive(row as HazardRow))
              return rest;
            return [row as HazardRow, ...rest];
          });
        },
      )
      .subscribe();

    // Expiry is enforced in RLS too, but rows already on the device need a sweep.
    const timer = setInterval(() => setRows((prev) => prev.filter(isLive)), 60_000);
    return () => {
      void supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [status, userId]);

  const hazards = useMemo(
    () => rows.filter(isLive).map((r) => ({ ...r, mine: r.user_id === userId })),
    [rows, userId],
  );

  const notice = useMemo<HazardNotice>(() => {
    const route = routes[activeRoute];
    if (!route || !position) return null;
    const me: [number, number] = [position.lon, position.lat];
    const here = projectOnLine(me, route.coords);

    const alongTo = (target: number) => {
      let metres = 0;
      for (let i = here.index; i < target && i < route.coords.length - 1; i++)
        metres += haversine(route.coords[i]!, route.coords[i + 1]!);
      return metres;
    };

    let best: HazardNotice = null;
    for (const h of hazards) {
      if (dismissed.includes(h.id)) continue;
      const there = projectOnLine([h.lon, h.lat], route.coords);
      // "Ahead on the route" means on this road, not merely nearby.
      if (there.distance > 120) continue;
      const aheadMetres = alongTo(there.index);
      if (aheadMetres <= 0 || aheadMetres > AHEAD_BANNER_METRES) continue;
      if (!best || aheadMetres < best.aheadMetres) best = { hazard: h, aheadMetres };
    }
    return best;
  }, [hazards, routes, activeRoute, position, dismissed]);

  const post = useCallback<HazardState["post"]>(
    async ({ text, draft }) => {
      if (!userId) return { error: "Sign in to report a hazard." };
      const body = text.trim().slice(0, MAX_REPORT_CHARS);
      if (body.length < 3) return { error: "Describe the hazard in a few words." };
      if (!position) return { error: "We need your location to file a report." };
      const location =
        draft.location_summary ||
        (await reverseGeocode(position.lon, position.lat).catch(() => ""));
      const { data, error } = await supabase
        .from("road_hazards")
        .insert({
          user_id: userId,
          lat: position.lat,
          lon: position.lon,
          category: draft.category,
          severity: draft.severity,
          summary: draft.summary,
          location_summary: location.slice(0, 160),
          confidence: draft.confidence,
          raw_text: body,
          expires_at: expiryFor(draft.category),
        })
        .select("*")
        .single();
      if (error) {
        // Never show raw PostgREST text to the driver.
        const policy = /row-level security|policy/i.test(error.message);
        return {
          error: policy
            ? "You are posting too often, or that expiry was rejected. Please try again shortly."
            : "Could not file that report. Please try again.",
        };
      }
      if (data)
        setRows((prev) => [
          data as HazardRow,
          ...prev.filter((h) => h.id !== (data as HazardRow).id),
        ]);
      return { error: null };
    },
    [userId, position],
  );

  const withdraw = useCallback(async (id: string) => {
    const { error } = await supabase.from("road_hazards").delete().eq("id", id);
    if (!error) setRows((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const value = useMemo<HazardState>(
    () => ({
      hazards,
      notice,
      dismissNotice: () => {
        if (notice) setDismissed((d) => [...d, notice.hazard.id]);
      },
      post,
      withdraw,
    }),
    [hazards, notice, post, withdraw],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHazards() {
  return useContext(Ctx);
}
