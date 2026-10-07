import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMapState } from "@/components/map/MapContext";
import { useSettings } from "@/lib/settings";
import { projectOnLine } from "@/lib/format";
import {
  dropCache,
  fetchMaxspeedWays,
  limitAtIndex,
  nextSign,
  projectSpeedLimits,
  readCache,
  routeKey,
  writeCache,
  type SpeedSegment,
  type SpeedSignPoint,
} from "@/lib/speedLimits";

export type SpeedLimitState = "idle" | "loading" | "ready" | "error";

export type SpeedLimits = {
  state: SpeedLimitState;
  /** Signs where the posted limit changes along the active route. */
  signs: SpeedSignPoint[];
  segments: SpeedSegment[];
  /**
   * Limit for the stretch the user is on, snapped to the route.
   * null = unknown for that stretch, which the UI must state explicitly.
   */
  currentKmh: number | null;
  /** Road name for the current stretch, when OSM has one. */
  currentRoad: string | null;
  /** Next change point ahead, for "limit changes in ..." hints. */
  aheadKmh: number | null;
  aheadRoad: string | null;
  canRetry: boolean;
  retry: () => void;
};

const EMPTY: SpeedLimits = {
  state: "idle",
  signs: [],
  segments: [],
  currentKmh: null,
  currentRoad: null,
  aheadKmh: null,
  aheadRoad: null,
  canRetry: false,
  retry: () => {},
};

const Ctx = createContext<SpeedLimits>(EMPTY);

/**
 * Resolves posted speed limits for the active route and keeps them in sync with
 * the driver's position. Fetching happens once per route and is cached on the
 * device; failures land in the "error" state so the UI can say the limit is
 * unknown rather than inventing a number.
 */
export function SpeedLimitsProvider({ children }: { children: ReactNode }) {
  const { routes, activeRoute, position } = useMapState();
  const { settings } = useSettings();
  const enabled = settings.postedLimits;
  const route = routes[activeRoute];
  const key = route ? routeKey(route.coords) : null;
  const [state, setState] = useState<SpeedLimitState>("idle");
  const [data, setData] = useState<{ signs: SpeedSignPoint[]; segments: SpeedSegment[] }>({
    signs: [],
    segments: [],
  });
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !route || !key) {
      inFlight.current = null;
      setState("idle");
      setData({ signs: [], segments: [] });
      return;
    }
    if (inFlight.current === key) return;
    const cached = readCache(key, route.coords);
    if (cached) {
      setData(projectSpeedLimits(cached.ways, route.coords));
      setState("ready");
      return;
    }
    const ac = new AbortController();
    inFlight.current = key;
    setState("loading");
    fetchMaxspeedWays(route.coords, ac.signal)
      .then((ways) => {
        writeCache(key, route.coords, ways);
        setData(projectSpeedLimits(ways, route.coords));
        setState("ready");
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        inFlight.current = null;
        setData({ signs: [], segments: [] });
        setState("error");
      });
    return () => ac.abort();
  }, [enabled, route, key, attempt]);

  // The projected limits change with the route, so recompute from the cache rather
  // than from the network when the driver moves along a cached route.
  useEffect(() => {
    if (state !== "ready" || !route || !key) return;
    const cached = readCache(key, route.coords);
    if (cached) setData(projectSpeedLimits(cached.ways, route.coords));
  }, [route, key, state]);

  const retry = useCallback(() => {
    if (!key) return;
    dropCache(key);
    inFlight.current = null;
    setAttempt((a) => a + 1);
  }, [key]);

  const snapped = useMemo(() => {
    if (!route || !position) return { index: -1, off: Infinity };
    const at = projectOnLine([position.lon, position.lat], route.coords);
    return { index: at.index, off: at.distance };
  }, [route, position]);

  const value = useMemo<SpeedLimits>(() => {
    if (!route || !enabled) return { ...EMPTY, retry };
    const onRoute = snapped.off < 60;
    const segment = onRoute
      ? data.segments.find((s) => snapped.index >= s.from && snapped.index < s.to)
      : undefined;
    const ahead = onRoute ? nextSign(data.segments, snapped.index + 1) : null;
    return {
      state,
      signs: data.signs,
      segments: data.segments,
      currentKmh: onRoute ? limitAtIndex(data.segments, snapped.index) : null,
      currentRoad: segment?.road ?? null,
      aheadKmh: ahead?.limitKmh ?? null,
      aheadRoad: ahead?.road ?? null,
      canRetry: state === "error",
      retry,
    };
  }, [route, enabled, state, data, snapped, retry]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSpeedLimits() {
  return useContext(Ctx);
}
