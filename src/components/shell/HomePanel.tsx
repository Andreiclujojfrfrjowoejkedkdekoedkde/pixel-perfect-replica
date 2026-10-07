import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Banknote,
  BedDouble,
  BookOpen,
  Clock,
  Fuel,
  GraduationCap,
  Heart,
  Landmark,
  MapPin,
  Navigation,
  ParkingSquare,
  Pill,
  PlugZap,
  RefreshCw,
  School,
  Trees,
  Utensils,
  Zap,
} from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { CATEGORIES, categoryCacheKey, categorySearch, type Place } from "@/lib/services";
import { useLibrary, library } from "@/lib/library";
import { fmtDistance, haversine } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { storage } from "@/lib/platform";
import { useNamedPlaces, namedPlaces } from "@/lib/places";

const ICONS = {
  fuel: Fuel,
  food: Utensils,
  parking: ParkingSquare,
  charging: PlugZap,
  pharmacy: Pill,
  lodging: BedDouble,
  groceries: Landmark,
  bank: Banknote,
  school: School,
  toilets: BookOpen,
  park: Trees,
} as const;

const CACHE_KEY = "category-cache";
const CACHE_TTL = 10 * 60 * 1000;
type CacheEntry = { at: number; places: Place[] };
const readCache = (key: string): CacheEntry | null => {
  const all = storage.get<Record<string, CacheEntry>>(CACHE_KEY, {});
  const hit = all[key];
  return hit && Date.now() - hit.at < CACHE_TTL ? hit : null;
};
const writeCache = (key: string, places: Place[]) => {
  const all = storage.get<Record<string, CacheEntry>>(CACHE_KEY, {});
  const next = { ...all, [key]: { at: Date.now(), places } satisfies CacheEntry };
  // Bounded so repeated browsing cannot grow local storage forever.
  const trimmed = Object.fromEntries(
    Object.entries(next)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 24),
  );
  storage.set(CACHE_KEY, trimmed);
};

type Status = "idle" | "loading" | "ready" | "error";

export function HomePanel() {
  const { map, setMarkers, position } = useMapState();
  const { saved, recent } = useLibrary();
  const { places: named } = useNamedPlaces();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [active, setActive] = useState<string | null>(null);
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const bbox = useRef<[number, number, number, number] | null>(null);

  const load = useCallback(
    async (id: string, tag: string) => {
      if (!map) return;
      const b = map.getBounds();
      const box: [number, number, number, number] = [
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth(),
      ];
      bbox.current = box;
      const key = categoryCacheKey(tag, box);
      const cached = readCache(key);
      if (cached) {
        setResults(cached.places);
        setStatus("ready");
        setMessage(null);
        return;
      }
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setStatus("loading");
      setMessage(null);
      try {
        const r = await categorySearch(tag, box, ac.signal);
        if (ac.signal.aborted) return;
        writeCache(key, r);
        setResults(r);
        setStatus("ready");
        setMessage(r.length ? null : "Nothing like that in this view. Zoom out or pan.");
      } catch (e) {
        if (ac.signal.aborted) return;
        setResults([]);
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Could not load places in this area.");
      }
    },
    [map],
  );

  // Reload when the driver pans while a category is open, so results follow the view.
  useEffect(() => {
    if (!map || !active) return;
    const cat = CATEGORIES.find((c) => c.id === active);
    if (!cat) return;
    let timer: ReturnType<typeof setTimeout>;
    const onMoveEnd = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(active, cat.tag), 700);
    };
    map.on("moveend", onMoveEnd);
    return () => {
      clearTimeout(timer);
      map.off("moveend", onMoveEnd);
    };
  }, [map, active, load]);

  useEffect(() => () => abort.current?.abort(), []);

  const toggle = (id: string, tag: string) => {
    if (active === id) {
      abort.current?.abort();
      setActive(null);
      setResults([]);
      setStatus("idle");
      setMarkers([]);
      return;
    }
    setActive(id);
    void load(id, tag);
  };

  useEffect(() => {
    if (status === "ready") setMarkers(results);
    // Only publish markers once results are settled, so panning does not clear them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, results]);

  const origin: [number, number] | null = position
    ? [position.lon, position.lat]
    : map
      ? (map.getCenter().toArray() as [number, number])
      : null;

  const sorted = useMemo(() => {
    if (!origin) return results;
    return [...results].sort(
      (a, z) => haversine(origin, [a.lon, a.lat]) - haversine(origin, [z.lon, z.lat]),
    );
  }, [results, origin]);

  const open = (p: Place) => {
    library.addRecent(p);
    map?.flyTo({ center: [p.lon, p.lat], zoom: 16 });
    navigate({ to: "/map/place/$id", params: { id: p.id } });
  };

  const ActiveIcon = active ? ICONS[active as keyof typeof ICONS] : MapPin;

  const Row = ({ p, icon: Icon }: { p: Place; icon: typeof Clock }) => (
    <button
      onClick={() => open(p)}
      className="flex w-full items-center gap-3 border-b border-border/60 px-5 py-3 text-left last:border-0 hover:bg-secondary/60"
    >
      <Icon strokeWidth={1.5} className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15px]">{p.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {p.kind}
          {p.subtitle ? ` · ${p.subtitle}` : ""}
        </span>
      </span>
      {origin && (
        <span className="tnum shrink-0 text-xs text-muted-foreground">
          {fmtDistance(haversine(origin, [p.lon, p.lat]), settings.units)}
        </span>
      )}
    </button>
  );

  return (
    <div className="pb-8">
      {/* quick actions */}
      <div className="px-5 pt-4">
        <Link
          to="/map/directions"
          className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground hover:bg-primary-hover"
        >
          <Navigation strokeWidth={1.5} className="h-4 w-4" /> Directions
        </Link>
      </div>

      {/* category toolbar */}
      <div
        className="mt-4 flex gap-2 overflow-x-auto px-5 pb-2"
        role="toolbar"
        aria-label="Nearby categories"
      >
        {CATEGORIES.map((c) => {
          const Icon = ICONS[c.id as keyof typeof ICONS] ?? MapPin;
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id, c.tag)}
              aria-pressed={active === c.id}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active === c.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:border-foreground/40"
              }`}
            >
              <Icon strokeWidth={1.5} className="h-4 w-4" /> {c.label}
            </button>
          );
        })}
      </div>

      {/* category results */}
      {active && (
        <section>
          <div className="flex items-baseline justify-between px-5 pt-3">
            <h2 className="smallcaps text-xs text-muted-foreground">
              {CATEGORIES.find((c) => c.id === active)?.label} in view
            </h2>
            <div className="flex items-center gap-3">
              <span className="tnum text-xs text-muted-foreground">
                {status === "loading" ? "loading…" : status === "ready" ? `${sorted.length}` : ""}
              </span>
              <button
                onClick={() => {
                  const cat = CATEGORIES.find((c) => c.id === active);
                  if (cat) void load(active, cat.tag);
                }}
                aria-label="Reload places in this area"
                className="text-muted-foreground hover:text-primary"
              >
                <RefreshCw
                  strokeWidth={1.5}
                  className={`h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`}
                />
              </button>
              <button
                onClick={() => toggle(active, CATEGORIES.find((c) => c.id === active)!.tag)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
          <div className="hairline mx-5 mt-2" />
          {message && <p className="px-5 py-3 text-sm text-muted-foreground">{message}</p>}
          {status === "ready" && sorted.length > 0 && (
            <>
              {sorted.slice(0, 60).map((p) => (
                <Row key={p.id} p={p} icon={ActiveIcon} />
              ))}
              {sorted.length > 60 && (
                <p className="px-5 py-3 text-xs text-muted-foreground">
                  Showing the 60 closest of {sorted.length}. Zoom in to narrow it down.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* your places */}
      {!active && named.length > 0 && (
        <section className="pt-6">
          <h2 className="smallcaps px-5 text-xs text-muted-foreground">Your places</h2>
          <div className="hairline mx-5 mt-2" />
          {["home", "work", "school"].map((slot) => {
            const p = named.find((x) => x.list === slot);
            if (!p) return null;
            const Icon = slot === "home" ? Heart : slot === "work" ? BookOpen : School;
            return (
              <button
                key={slot}
                onClick={() =>
                  navigate({
                    to: "/map/directions",
                    search: { to: `${p.lat},${p.lon}`, toName: p.name },
                  })
                }
                className="flex w-full items-center gap-3 border-b border-border/60 px-5 py-3 text-left hover:bg-secondary/60"
              >
                <Icon strokeWidth={1.5} className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="smallcaps block text-[11px] text-muted-foreground">{slot}</span>
                  <span className="block truncate font-display text-[15px]">{p.name}</span>
                </span>
                <Zap strokeWidth={1.5} className="h-4 w-4 shrink-0 text-primary" />
              </button>
            );
          })}
        </section>
      )}

      {/* saved + recent */}
      {!active && (
        <>
          <section className="pt-6">
            <h2 className="smallcaps px-5 text-xs text-muted-foreground">Saved</h2>
            <div className="hairline mx-5 mt-2" />
            {saved.length ? (
              saved.map((p) => <Row key={p.id} p={p} icon={MapPin} />)
            ) : (
              <p className="px-5 py-3 text-sm text-muted-foreground">
                Places you save appear here.
              </p>
            )}
          </section>
          <section className="pt-6">
            <div className="flex items-baseline justify-between px-5">
              <h2 className="smallcaps text-xs text-muted-foreground">Recent</h2>
              {recent.length > 0 && (
                <button
                  onClick={() => library.clearRecent()}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="hairline mx-5 mt-2" />
            {recent.length ? (
              recent.map((p) => <Row key={p.id} p={p} icon={Clock} />)
            ) : (
              <p className="px-5 py-3 text-sm text-muted-foreground">
                No recent searches. Press / to search, or right-click the map to drop a pin.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export { namedPlaces };
