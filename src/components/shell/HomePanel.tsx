import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Fuel, Utensils, ParkingSquare, PlugZap, Pill, BedDouble, Bookmark, Clock, Navigation, Compass, ArrowUpRight, Download, ChevronDown, ChevronRight } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { CATEGORIES, nearbyCategory, type Place } from "@/lib/services";
import { useLibrary, library } from "@/lib/library";
import { fmtDistance, haversine } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import { visibleMapPlaces } from "@/lib/map-places";

const ICONS = { fuel: Fuel, food: Utensils, parking: ParkingSquare, charging: PlugZap, pharmacy: Pill, lodging: BedDouble };

export function HomePanel() {
  const { map, setMarkers, position } = useMapState();
  const { saved, recent } = useLibrary();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [active, setActive] = useState<string | null>(null);
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [retry, setRetry] = useState(0);

  const request = useRef<AbortController | null>(null);
  const cache = useRef(new Map<string, { time: number; places: Place[] }>());
  const runCategory = (id: string) => {
    request.current?.abort();
    if (active === id) { setActive(null); setResults([]); setMarkers([]); setStatus(null); return; }
    setActive(id);
  };

  useEffect(() => {
    if (!map || !active) return;
    const category = CATEGORIES.find(c => c.id === active);
    if (!category) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const load = async () => {
      request.current?.abort();
      const b = map.getBounds();
      setResults([]); setMarkers([]);
      const width = haversine([b.getWest(), b.getCenter().lat], [b.getEast(), b.getCenter().lat]);
      const height = haversine([b.getCenter().lng, b.getSouth()], [b.getCenter().lng, b.getNorth()]);
      if (map.getZoom() < 11 || width * height > 2500000000) {
        setStatus("Zoom in to see places in this area."); return;
      }
      const bounds: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const key = `${active}:${bounds.map(n => n.toFixed(4)).join(":")}`;
      const controller = new AbortController(); request.current = controller;
      const tilePlaces = visibleMapPlaces(map, active);
      const publish = (places: Place[]) => {
        const current = map.getBounds();
        const r = places.filter(p => current.contains([p.lon, p.lat]));
        const center = map.getCenter().toArray() as [number, number];
        r.sort((a, z) => haversine(center, [a.lon, a.lat]) - haversine(center, [z.lon, z.lat]));
        setResults(r); setMarkers(r);
      };
      publish(tilePlaces);
      setStatus(tilePlaces.length ? "Map places · checking for more" : "Looking around this area");
      try {
        const cached = cache.current.get(key);
        const found = cached && Date.now() - cached.time < 300000 ? cached.places : await nearbyCategory(category.id, category.tag, bounds, controller.signal);
        if (disposed || controller.signal.aborted) return;
        if (cache.current.size >= 20) { const oldest = cache.current.keys().next().value; if (oldest) cache.current.delete(oldest); }
        cache.current.set(key, { time: Date.now(), places: found });
        publish(found.length ? found : tilePlaces); setStatus(found.length || tilePlaces.length ? null : "Nothing found in view.");
      } catch (error) { if (!disposed && !controller.signal.aborted) { publish(tilePlaces); setStatus(tilePlaces.length ? "Showing map places · full search is busy. Please retry." : (error as Error).message); } }
    };
    const schedule = () => {
      request.current?.abort(); setMarkers([]); setResults([]);
      clearTimeout(timer); timer = setTimeout(() => { void load(); }, 750);
    };
    const onIdle = () => { if (request.current?.signal.aborted || !request.current) return; const places = visibleMapPlaces(map, active); if (places.length) { setResults(previous => previous.length ? previous : places); setMarkers(previous => previous.length ? previous : places); } };
    void load(); map.on("moveend", schedule); map.on("idle", onIdle);
    return () => { disposed = true; clearTimeout(timer); request.current?.abort(); map.off("moveend", schedule); map.off("idle", onIdle); };
  }, [map, active, retry, setMarkers]);

  const origin: [number, number] | null = position ? [position.lon, position.lat] : map ? (map.getCenter().toArray() as [number, number]) : null;

  const Row = ({ p, icon: Icon }: { p: Place; icon: typeof Clock }) => (
    <Button variant="ghost"
      onClick={() => { library.addRecent(p); map?.flyTo({ center: [p.lon, p.lat], zoom: 16 }); navigate({ to: "/place/$id", params: { id: p.id } }); }}
      className="h-auto justify-start whitespace-normal rounded-none flex w-full items-center gap-3 border-b px-5 py-3 text-left last:border-0 hover:bg-secondary/60"
    >
      <Icon strokeWidth={1.5} className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15px]">{p.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{p.kind}{p.subtitle ? ` · ${p.subtitle}` : ""}</span>
      </span>
      {origin && <span className="tnum text-xs text-muted-foreground">{fmtDistance(haversine(origin, [p.lon, p.lat]), settings.units)}</span>}
    </Button>
  );

  return (
    <div className="home-panel pb-6">
      <header className="flex items-center justify-between px-5 pb-4 pt-5">
        <div><h1 className="font-display text-3xl">Meridian</h1><p className="mt-1 text-xs text-muted-foreground">Your atlas, in motion</p></div>
        <Compass strokeWidth={1.5} className="h-9 w-9 text-primary" />
      </header>
      <div className="grid grid-cols-3 gap-2 px-5 pb-4" role="toolbar" aria-label="Nearby categories">
        {CATEGORIES.map((c) => {
          const Icon = ICONS[c.id];
          return (
            <Button variant="ghost"
              key={c.id}
               onClick={() => runCategory(c.id)}
              aria-pressed={active === c.id}
              className={`home-category h-11 min-w-0 gap-1.5 rounded-lg border px-2 text-xs ${active === c.id ? "border-primary bg-primary text-primary-foreground" : "glass hover:border-primary/40 hover:text-primary"}`}
            >
              <Icon strokeWidth={1.5} className="h-4 w-4" /> {c.label}
            </Button>
          );
        })}
      </div>
      {status && <div role="status" className="px-5 pb-2 text-sm text-muted-foreground"><p>{status}</p>{status.includes("retry") && <Button variant="ghost" size="sm" className="mt-1 text-primary" onClick={() => setRetry(v => v + 1)}>Retry search</Button>}</div>}

      {results.length > 0 ? (
        <section>
          <h2 className="smallcaps px-5 pt-2 text-xs text-muted-foreground">{results.length} in view</h2>
          {results.slice(0, 40).map((p) => <Row key={p.id} p={p} icon={ICONS[active as keyof typeof ICONS] ?? Clock} />)}
        </section>
      ) : (
        <>
          <div className="px-5 pt-2">
            <Button asChild className="home-directions h-12 w-full justify-start rounded-lg"><Link to="/directions"><Navigation strokeWidth={1.5} /> Directions <ArrowUpRight className="ml-auto" /></Link></Button>
            <Button asChild variant="ghost" className="mt-2 h-10 w-full justify-start text-muted-foreground"><Link to="/offline"><Download strokeWidth={1.5} /> Offline maps <ArrowUpRight className="ml-auto" /></Link></Button>
          </div>
          <section className="pt-5">
            <Button variant="ghost" onClick={() => setSavedOpen(v => !v)} aria-expanded={savedOpen} aria-controls="saved-places" className="h-9 w-full justify-between px-5"><span className="smallcaps text-xs text-muted-foreground">Saved <span className="tnum ml-2">{saved.length}</span></span>{savedOpen ? <ChevronDown strokeWidth={1.5} /> : <ChevronRight strokeWidth={1.5} />}</Button>
            {savedOpen && <div id="saved-places"><div className="hairline mx-5 mt-2" />{saved.length ? saved.map((p) => <Row key={p.id} p={p} icon={Bookmark} />) : <p className="px-5 py-4 text-sm text-muted-foreground">No saved places yet</p>}</div>}
          </section>
          <section className="pt-5">
            <Button variant="ghost" onClick={() => setRecentOpen(v => !v)} aria-expanded={recentOpen} aria-controls="recent-places" className="h-9 w-full justify-between px-5"><span className="smallcaps text-xs text-muted-foreground">Recent <span className="tnum ml-2">{recent.length}</span></span>{recentOpen ? <ChevronDown strokeWidth={1.5} /> : <ChevronRight strokeWidth={1.5} />}</Button>
            {recentOpen && <div id="recent-places"><div className="hairline mx-5 mt-2" />{recent.length ? <>{recent.map((p) => <Row key={p.id} p={p} icon={Clock} />)}<Button variant="ghost" onClick={() => library.clearRecent()} className="mx-5 text-xs text-muted-foreground">Clear</Button></> : <p className="px-5 py-4 text-sm text-muted-foreground">No recent searches</p>}</div>}
          </section>
        </>
      )}
    </div>
  );
}
