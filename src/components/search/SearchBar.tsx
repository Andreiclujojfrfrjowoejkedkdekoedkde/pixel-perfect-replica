import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, X, Clock, Bookmark, MapPin, Settings as Cog, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMapState } from "@/components/map/MapContext";
import { photonSearch, type Place } from "@/lib/services";
import { useLibrary, library } from "@/lib/library";
import { fmtDistance, haversine, parseCoords } from "@/lib/format";
import { localSearch } from "@/lib/offline-data";
import { useSettings } from "@/lib/settings";

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="bg-transparent font-semibold text-primary">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export const SearchBar = forwardRef<HTMLInputElement, { home?: boolean; onChoose?: (p: Place) => void }>(function SearchBar({ home = false, onChoose }, ref) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [isOfflineResult, setIsOfflineResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const { map, position } = useMapState();
  const { saved, recent } = useLibrary();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim() || parseCoords(q)) { setResults([]); return; }
    const ac = new AbortController();
    const t = setTimeout(() => {
      const c = map ? (map.getCenter().toArray() as [number, number]) : [0, 0] as [number, number];
      (async () => {
        const local = await localSearch(q,c).catch(() => null);
        if (local && (local.length || !navigator.onLine)) { if (!ac.signal.aborted) { setResults(local); setIsOfflineResult(true); setError(null); } return; }
        const r = await photonSearch(q,c,ac.signal);
        if (!ac.signal.aborted) { setResults(r); setIsOfflineResult(false); setError(null); }
      })().catch(e => { if (!ac.signal.aborted) { setResults([]); setError(navigator.onLine ? e.message : "No downloaded places match this search."); } });
    }, 150);
    return () => { clearTimeout(t); ac.abort(); };
  }, [q, map]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const ql = q.toLowerCase();
  const groups = useMemo(() => {
    const coord = parseCoords(q);
    const g: { label: string; icon: typeof MapPin; items: Place[] }[] = [];
    if (coord) g.push({ label: "Coordinates", icon: MapPin, items: [{ id: `@${coord[1]},${coord[0]}`, name: `${coord[1]}, ${coord[0]}`, subtitle: "Go to this point", kind: "Point", lon: coord[0], lat: coord[1] }] });
    const s = saved.filter((p) => !q || p.name.toLowerCase().includes(ql));
    const r = recent.filter((p) => !q || p.name.toLowerCase().includes(ql));
    if (s.length) g.push({ label: "Saved", icon: Bookmark, items: s.slice(0, 4) });
    if (r.length) g.push({ label: "Recent", icon: Clock, items: r.slice(0, q ? 3 : 6) });
    const places = results.filter((p) => p.kind !== "Address");
    const addresses = results.filter((p) => p.kind === "Address");
    if (places.length) g.push({ label: isOfflineResult ? "Offline places" : "Places", icon: MapPin, items: places });
    if (addresses.length) g.push({ label: isOfflineResult ? "Offline addresses" : "Addresses", icon: MapPin, items: addresses });
    return g;
  }, [q, ql, saved, recent, results, isOfflineResult]);
  const flat = groups.flatMap((g) => g.items);

  const choose = (p: Place) => {
    if (onChoose) { setOpen(false); setQ(p.name); onChoose(p); return; }
    library.addRecent(p);
    setOpen(false);
    setQ(p.name);
    map?.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 15) });
    navigate({ to: "/place/$id", params: { id: p.id } });
  };

  const origin: [number, number] | null = position ? [position.lon, position.lat] : map ? (map.getCenter().toArray() as [number, number]) : null;

  return (
    <div ref={wrap} className="relative w-full">
      <div className={`glass flex items-center gap-2 px-3 ${home ? "homepage-search h-[72px] rounded-2xl sm:px-6" : "h-12 rounded-2xl"}`}>
        <Search strokeWidth={1.5} className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          ref={ref}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setCursor(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            else if (e.key === "Enter" && flat[cursor]) choose(flat[cursor]);
            else if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
          }}
          placeholder={home ? "Where do you want to go?" : "Search places, addresses, coordinates"}
          aria-label="Search"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        {q && <Button variant="ghost" size="icon" aria-label="Clear search" onClick={() => { setQ(""); setResults([]); }} className="shrink-0 text-muted-foreground hover:text-foreground"><X strokeWidth={1.5} className="h-5 w-5" /></Button>}
        {home ? <Button disabled={!flat.length} onClick={() => { const p = flat[cursor] ?? flat[0]; if (p) choose(p); }} className="shrink-0 rounded-full px-5"><Navigation strokeWidth={1.5} className="h-4 w-4" />Go</Button> : !onChoose && <Button variant="ghost" size="icon" aria-label="Settings" onClick={() => navigate({ to: "/settings" })} className="shrink-0 text-muted-foreground hover:text-foreground"><Cog strokeWidth={1.5} className="h-5 w-5" /></Button>}
      </div>
      {open && (groups.length > 0 || error) && (
        <div id="search-results" role="listbox" className={`surface absolute left-0 right-0 z-40 max-h-[60vh] overflow-y-auto rounded-2xl border py-2 shadow-xl ${home ? "top-20" : "top-14"}`}>
          {error && <p className="px-4 py-2 text-sm text-muted-foreground">{error}</p>}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="smallcaps px-4 pb-1 pt-2 text-[11px] text-muted-foreground">{g.label}</div>
              {g.items.map((p) => {
                const idx = flat.indexOf(p);
                return (
                   <Button variant="ghost"
                    key={g.label + p.id}
                    role="option"
                    aria-selected={idx === cursor}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => choose(p)}
                     className={`flex h-auto w-full items-start justify-start gap-3 rounded-none px-4 py-2 text-left ${idx === cursor ? "bg-secondary" : ""}`}
                  >
                    <g.icon strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm"><Highlight text={p.name} q={q} /></span>
                      <span className="block truncate text-xs text-muted-foreground">{p.kind}{p.subtitle ? ` · ${p.subtitle}` : ""}</span>
                    </span>
                    {origin && <span className="tnum shrink-0 text-xs text-muted-foreground">{fmtDistance(haversine(origin, [p.lon, p.lat]), settings.units)}</span>}
                   </Button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
