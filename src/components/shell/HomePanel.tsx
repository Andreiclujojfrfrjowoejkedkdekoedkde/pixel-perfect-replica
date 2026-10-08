import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Fuel, Utensils, ParkingSquare, PlugZap, Pill, BedDouble, Bookmark, Clock, Navigation } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { CATEGORIES, nearbyCategory, type Place } from "@/lib/services";
import { useLibrary, library } from "@/lib/library";
import { fmtDistance, haversine } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";

const ICONS = { fuel: Fuel, food: Utensils, parking: ParkingSquare, charging: PlugZap, pharmacy: Pill, lodging: BedDouble };

export function HomePanel() {
  const { map, setMarkers, position } = useMapState();
  const { saved, recent } = useLibrary();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [active, setActive] = useState<string | null>(null);
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const request = useRef<AbortController | null>(null);
  const runCategory = async (id: string, tag: string) => {
    if (!map) return;
    request.current?.abort();
    if (active === id) { setActive(null); setResults([]); setMarkers([]); return; }
    setActive(id); setStatus("Looking around this area"); setResults([]);
    const controller = new AbortController(); request.current = controller;
    const b = map.getBounds();
    const center = map.getCenter();
    const dx = Math.min(0.12, 0.045 / Math.max(0.25, Math.cos(center.lat * Math.PI / 180)));
    const bounds: [number,number,number,number] = [Math.max(b.getWest(),center.lng-dx), Math.max(b.getSouth(),center.lat-0.045), Math.min(b.getEast(),center.lng+dx), Math.min(b.getNorth(),center.lat+0.045)];
    try {
      const r = await nearbyCategory(id, tag, bounds, controller.signal);
      if (controller.signal.aborted) return;
      const c = map.getCenter().toArray() as [number, number];
      r.sort((a, z) => haversine(c, [a.lon, a.lat]) - haversine(c, [z.lon, z.lat]));
      setResults(r); setMarkers(r);
      setStatus(r.length ? null : "Nothing found in view.");
    } catch (e) {
      if (controller.signal.aborted) return;
      setStatus((e as Error).message); setActive(null);
    }
  };

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
    <div className="pb-6">
      <div className="flex gap-2 overflow-x-auto px-5 pb-3 pt-4" role="toolbar" aria-label="Nearby categories">
        {CATEGORIES.map((c) => {
          const Icon = ICONS[c.id];
          return (
            <Button variant="ghost"
              key={c.id}
              onClick={() => runCategory(c.id, c.tag)}
              aria-pressed={active === c.id}
              className={`h-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${active === c.id ? "border-primary bg-primary text-primary-foreground" : "hover:border-foreground/40"}`}
            >
              <Icon strokeWidth={1.5} className="h-4 w-4" /> {c.label}
            </Button>
          );
        })}
      </div>
      {status && <p className="px-5 pb-2 text-sm text-muted-foreground">{status}</p>}

      {results.length > 0 ? (
        <section>
          <h2 className="smallcaps px-5 pt-2 text-xs text-muted-foreground">{results.length} in view</h2>
          {results.slice(0, 40).map((p) => <Row key={p.id} p={p} icon={ICONS[active as keyof typeof ICONS] ?? Clock} />)}
        </section>
      ) : (
        <>
          <div className="px-5 pt-2">
            <Link to="/directions" className="flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover">
              <Navigation strokeWidth={1.5} className="h-4 w-4" /> Directions
            </Link>
          </div>
          <section className="pt-5">
            <h2 className="smallcaps px-5 text-xs text-muted-foreground">Saved</h2>
            <div className="hairline mx-5 mt-2" />
            {saved.length ? saved.map((p) => <Row key={p.id} p={p} icon={Bookmark} />) : <p className="px-5 py-3 text-sm text-muted-foreground">Places you save appear here.</p>}
          </section>
          <section className="pt-5">
            <div className="flex items-baseline justify-between px-5">
              <h2 className="smallcaps text-xs text-muted-foreground">Recent</h2>
              {recent.length > 0 && <Button variant="ghost" onClick={() => library.clearRecent()} className="text-xs text-muted-foreground hover:text-foreground">Clear</Button>}
            </div>
            <div className="hairline mx-5 mt-2" />
            {recent.length ? recent.map((p) => <Row key={p.id} p={p} icon={Clock} />) : <p className="px-5 py-3 text-sm text-muted-foreground">No recent searches. Press / to search, or right-click the map to drop a pin.</p>}
          </section>
        </>
      )}
    </div>
  );
}
