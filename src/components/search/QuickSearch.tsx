import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bookmark, Clock, Loader2, MapPin, Navigation, Search, X } from "lucide-react";
import { photonSearch, type Place } from "@/lib/services";
import { useLibrary, library } from "@/lib/library";
import { fmtDistance, haversine, parseCoords } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { network } from "@/lib/platform";
import { useOfflineSearch, offlineResults } from "@/lib/offlineSearch";
import { useNamedPlaces } from "@/lib/places";
import { useOptionalMapState } from "@/components/map/MapContext";

export type SearchGroup = { label: string; icon: typeof MapPin; items: Place[]; offline?: boolean };

/**
 * Shared search core: instant local matches, a debounced remote query with abort
 * and a staleness guard, and the offline index when the device has no connection
 * or is standing inside a downloaded area.
 */
export function useSearchSuggestions(query: string, origin: [number, number] | null, limit = 8) {
  const { saved, recent } = useLibrary();
  const { places } = useNamedPlaces();
  const offline = useOfflineSearch();
  const [remote, setRemote] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const q = query.trim();
  const coord = parseCoords(q);
  const offlineOnly = !network.online();
  const useLocalIndex = !!offline.places?.length && (offlineOnly || offline.covered);

  useEffect(() => {
    if (!q || coord || useLocalIndex) {
      setRemote([]);
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    const ac = new AbortController();
    setLoading(true);
    // Short debounce: enough to avoid a request per keystroke, short enough to
    // feel instant once the driver stops typing.
    const t = setTimeout(() => {
      photonSearch(q, origin ?? [0, 0], ac.signal)
        .then((r) => {
          // Drop replies that arrive after the driver has typed on.
          if (mine !== seq.current) return;
          setRemote(r);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name === "AbortError" || mine !== seq.current) return;
          setError(e.message);
        })
        .finally(() => {
          if (mine === seq.current) setLoading(false);
        });
    }, 120);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, origin, coord, useLocalIndex]);

  const groups = useMemo<SearchGroup[]>(() => {
    const out: SearchGroup[] = [];
    if (coord) {
      out.push({
        label: "Coordinates",
        icon: MapPin,
        items: [
          {
            id: `@${coord[1]},${coord[0]}`,
            name: `${coord[1]}, ${coord[0]}`,
            subtitle: "Go to this point",
            kind: "Point",
            lon: coord[0],
            lat: coord[1],
          },
        ],
      });
    }
    const needle = q.toLowerCase();
    const matches = (p: Place) => !needle || p.name.toLowerCase().includes(needle);

    const named = places.filter(matches);
    if (named.length) out.push({ label: "Your places", icon: Bookmark, items: named.slice(0, 3) });
    const s = saved.filter(matches);
    if (s.length) out.push({ label: "Saved", icon: Bookmark, items: s.slice(0, q ? 3 : 4) });
    const r = recent.filter(matches);
    if (r.length) out.push({ label: "Recent", icon: Clock, items: r.slice(0, q ? 3 : 6) });

    if (useLocalIndex && offline.places) {
      const local = offlineResults(offline.places, q, origin, 8);
      if (local.length)
        out.push({
          label: offlineOnly ? "Offline" : "Offline area",
          icon: MapPin,
          items: local,
          offline: true,
        });
    } else {
      const placesOnly = remote.filter((p) => p.kind !== "Address");
      const addresses = remote.filter((p) => p.kind === "Address");
      if (placesOnly.length)
        out.push({ label: "Places", icon: MapPin, items: placesOnly.slice(0, limit) });
      if (addresses.length)
        out.push({ label: "Addresses", icon: MapPin, items: addresses.slice(0, 4) });
    }
    return out;
  }, [
    q,
    coord,
    places,
    saved,
    recent,
    remote,
    offline.places,
    useLocalIndex,
    origin,
    offlineOnly,
    limit,
  ]);

  const flat = groups.flatMap((g) => g.items);
  return { groups, flat, loading, error, offline: useLocalIndex, offlineOnly, coord };
}

/** Origin to sort by: the driver's position when we have it, else the viewport. */
export function useSearchOrigin() {
  // The home screen has no map behind it, so this must not require a provider.
  const map = useOptionalMapState()?.map ?? null;
  const position = useOptionalMapState()?.position ?? null;
  return useMemo<[number, number] | null>(() => {
    if (position) return [position.lon, position.lat];
    const c = map?.getCenter();
    return c ? [c.lng, c.lat] : null;
  }, [position, map]);
}

export function ResultList({
  groups,
  flat,
  cursor,
  onHover,
  onPick,
  highlight,
}: {
  groups: SearchGroup[];
  flat: Place[];
  cursor: number;
  onHover: (i: number) => void;
  onPick: (p: Place) => void;
  highlight: string;
}) {
  const { settings } = useSettings();
  const origin = useSearchOrigin();
  return (
    <div id="search-results" role="listbox" className="surface max-h-[62vh] overflow-y-auto">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="smallcaps flex items-center gap-2 px-4 pb-1 pt-3 text-[11px] text-muted-foreground">
            {g.label}
            {g.offline && (
              <span className="rounded-full border px-1.5 py-px text-[9px] normal-case tracking-normal">
                Offline
              </span>
            )}
          </div>
          {g.items.map((p) => {
            const idx = flat.indexOf(p);
            return (
              <button
                key={`${g.label}-${p.id}`}
                role="option"
                aria-selected={idx === cursor}
                onMouseEnter={() => onHover(idx)}
                onClick={() => onPick(p)}
                className={`flex w-full items-start gap-3 px-4 py-2.5 text-left ${idx === cursor ? "bg-secondary" : ""}`}
              >
                <g.icon
                  strokeWidth={1.5}
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">
                    <Highlight text={p.name} q={highlight} />
                  </span>
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
          })}
        </div>
      ))}
      {groups.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No matches.</p>
      )}
    </div>
  );
}

export function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-semibold text-primary">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

/** The compact search box on the home screen. */
export function QuickSearch({
  onPick,
  onNavigate,
}: {
  onPick: (p: Place) => void;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const origin = useSearchOrigin();
  const { groups, flat, loading, offlineOnly } = useSearchSuggestions(q, origin);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const choose = (p: Place) => {
    library.addRecent(p);
    setOpen(false);
    onPick(p);
  };

  return (
    <div ref={wrap} className="relative">
      <div className="flex h-14 items-center gap-3 rounded-2xl px-4">
        <Search strokeWidth={1.5} className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setCursor(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, Math.max(0, flat.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter" && flat[cursor]) {
              choose(flat[cursor]);
            } else if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder={offlineOnly ? "Search offline places" : "Where do you want to go?"}
          aria-label="Search for a place"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground"
        />
        {loading && (
          <Loader2
            strokeWidth={1.5}
            className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
          />
        )}
        {q && (
          <button
            aria-label="Clear search"
            onClick={() => setQ("")}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X strokeWidth={1.5} className="h-5 w-5" />
          </button>
        )}
        <button
          onClick={() => navigate({ to: "/map/directions" })}
          className="glass hidden h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm sm:flex"
          aria-label="Plan a route"
        >
          <Navigation strokeWidth={1.5} className="h-4 w-4 text-primary" /> Go
        </button>
        <button
          onClick={onNavigate}
          className="glass h-10 w-10 shrink-0 rounded-xl sm:hidden"
          aria-label="Open map"
        >
          <MapPin strokeWidth={1.5} className="mx-auto h-5 w-5 text-primary" />
        </button>
      </div>
      {open && q.trim() && (
        <div className="absolute inset-x-0 top-16 z-40 overflow-hidden rounded-2xl border shadow-2xl">
          <ResultList
            groups={groups}
            flat={flat}
            cursor={cursor}
            onHover={setCursor}
            onPick={choose}
            highlight={q.trim()}
          />
        </div>
      )}
    </div>
  );
}
