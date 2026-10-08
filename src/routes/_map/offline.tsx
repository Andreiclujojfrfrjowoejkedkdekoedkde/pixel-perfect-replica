import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { X, Trash2, Pause, Play, Download, RefreshCw, Search } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { regions, downloadRegion, deleteRegion, regionArea, type OfflineRegion } from "@/lib/offline-data";
import { photonSearch, type Place } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { storage } from "@/lib/platform";

export const Route = createFileRoute("/_map/offline")({
  validateSearch: z.object({ lat: z.number().optional(), lon: z.number().optional() }),
  head: () => ({
    meta: [
      { title: "Offline maps — Meridian" },
      { name: "description", content: "Download map areas to use Meridian without a connection." },
      { property: "og:title", content: "Offline maps on Meridian" },
      { property: "og:description", content: "Save map areas for travel without signal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Offline,
});

type Area = { id: string; name: string; bbox: [number, number, number, number]; maxZoom: number; tiles: number; bytes: number; date: string };
const LEVELS = [{ z: 10, label: "Overview" }, { z: 13, label: "Standard" }, { z: 14, label: "Full detail" }];
const CACHE = "meridian-tiles-v1";

function tilesFor(b: [number, number, number, number], minZ: number, maxZ: number) {
  const out: [number, number, number][] = [];
  const lon2x = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const lat2y = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
  for (let z = minZ; z <= maxZ; z++) for (let x = lon2x(b[0], z); x <= lon2x(b[2], z); x++) for (let y = lat2y(b[3], z); y <= lat2y(b[1], z); y++) out.push([z, x, y]);
  return out;
}

function Offline() {
  const navigate = useNavigate();
  const { map, beginPick, cancelPick } = useMapState();
  const [roadRegions, setRoadRegions] = useState<OfflineRegion[]>([]);
  const [regionBusy, setRegionBusy] = useState(false);
  const [regionError, setRegionError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<Place[]>([]);
  const [customBbox, setCustomBbox] = useState<[number,number,number,number] | null>(null);
  const regionAbort = useRef<AbortController | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [level, setLevel] = useState(1);
  const [name, setName] = useState("");
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const queue = useRef<{ urls: string[]; i: number; area: Area } | null>(null);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);

  useEffect(() => {
    setAreas(storage.get("areas", []));
    regions().then(setRoadRegions).catch(() => {});
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    if (!map) return;
    const f = () => { const b = map.getBounds(); setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]); };
    f(); map.on("moveend", f);
    return () => { map.off("moveend", f); };
  }, [map]);

  const selectedBbox = customBbox ?? bbox;
  const detail = LEVELS[level] ?? LEVELS[1];
  const maxZoom = Math.min(detail?.z ?? 13,14);
  const count = selectedBbox ? tilesFor(selectedBbox, 0, maxZoom).length : 0;
  const roadArea = selectedBbox ? regionArea(selectedBbox) : 0;
  const loadRoads = async (target = selectedBbox, targetName = name) => {
    if (!target) return;
    const ac = new AbortController(); regionAbort.current = ac;
    setRegionBusy(true); setRegionError(null);
    try { await downloadRegion(targetName || "Travel area",target,ac.signal); setRoadRegions(await regions()); }
    catch (e) { if (!ac.signal.aborted) setRegionError((e as Error).message); }
    finally { setRegionBusy(false); }
  };
  const searchCity = async () => {
    setRegionError(null);
    try { setCities(await photonSearch(query,map ? map.getCenter().toArray() as [number,number] : [0,0])); }
    catch (e) { setRegionError((e as Error).message); }
  };
  const selectRectangle = () => {
    beginPick("first corner", first => {
      beginPick("opposite corner", second => {
        const b: [number,number,number,number] = [Math.min(first[0],second[0]),Math.min(first[1],second[1]),Math.max(first[0],second[0]),Math.max(first[1],second[1])];
        setCustomBbox(b); cancelPick();
      });
    });
  };
  const tooBig = count > 12000;
  const save = (a: Area[]) => { setAreas(a); storage.set("areas", a); };

  const run = async () => {
    const cache = await caches.open(CACHE);
    const q = queue.current;
    if (!q) return;
    while (q.i < q.urls.length) {
      if (pausedRef.current) return;
      const batch = q.urls.slice(q.i, q.i + 8);
      const sizes = await Promise.all(batch.map(async (u) => {
        try { const r = await fetch(u); if (r.ok) { const b = await r.clone().blob(); await cache.put(u, r); return b.size; } } catch { /* keep going */ }
        return 0;
      }));
      q.area.bytes += sizes.reduce((a, b) => a + b, 0);
      q.i += batch.length;
      setProg({ done: q.i, total: q.urls.length });
    }
    save([q.area, ...storage.get<Area[]>("areas", [])]);
    queue.current = null; setProg(null);
  };

  const start = async () => {
    if (!selectedBbox || tooBig) return;
    const tj = await fetch("https://tiles.openfreemap.org/planet").then((r) => r.json());
    const tpl: string = tj.tiles[0];
    const urls = tilesFor(selectedBbox, 0, maxZoom).map(([z, x, y]) => tpl.replace("{z}", `${z}`).replace("{x}", `${x}`).replace("{y}", `${y}`));
    for (const f of ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"]) for (const r of ["0-255", "256-511"]) urls.push(`https://tiles.openfreemap.org/fonts/${encodeURIComponent(f)}/${r}.pbf`);
    urls.push("https://tiles.openfreemap.org/planet");
    const area: Area = { id: `${Date.now()}`, name: name || "Travel area", bbox: selectedBbox, maxZoom, tiles: urls.length, bytes: 0, date: new Date().toISOString() };
    queue.current = { urls, i: 0, area };
    pausedRef.current = false; setPaused(false);
    setProg({ done: 0, total: urls.length });
    run();
  };

  const remove = async (a: Area) => {
    save(areas.filter((x) => x.id !== a.id));
    if (!areas.some((x) => x.id !== a.id)) await caches.delete(CACHE);
  };

  const total = areas.reduce((s, a) => s + a.bytes, 0);
  const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

  return (
    <div className="pb-8">
      <header className="flex items-center justify-between px-5 pt-5">
        <h1 className="font-display text-2xl">Offline maps</h1>
        <Button variant="ghost" onClick={() => navigate({ to: "/" })} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X strokeWidth={1.5} /></Button>
      </header>
      <section className="px-5 pt-4">
        <h2 className="font-display text-lg">Roads & places</h2>
        <div className="mt-3 flex gap-2"><input className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm" aria-label="Search travel area" placeholder="City or region" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") void searchCity(); }} /><Button variant="outline" size="icon" aria-label="Find travel area" title="Find travel area" onClick={searchCity}><Search /></Button></div>
        {cities.map(c=><Button key={c.id} variant="ghost" className="mt-1 h-auto w-full justify-start whitespace-normal text-left" onClick={()=>{ map?.flyTo({center:[c.lon,c.lat],zoom:13});setName(c.name);setCustomBbox([c.lon-0.025,c.lat-0.025,c.lon+0.025,c.lat+0.025]);setCities([]); }}>{c.name} · {c.subtitle}</Button>)}
        <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={selectRectangle}>Select rectangle</Button><Button variant="ghost" size="sm" onClick={()=>setCustomBbox(null)}>Use visible area</Button></div>
        <p className="tnum mt-3 text-xs text-muted-foreground">{roadArea.toFixed(1)} km² · maximum 200 km²</p>
        {regionError && <p role="alert" className="mt-2 text-sm text-destructive">{regionError}</p>}
        {regionBusy ? <div className="mt-3 flex items-center justify-between text-sm"><span>Downloading roads & places…</span><Button variant="ghost" size="sm" onClick={()=>regionAbort.current?.abort()}>Cancel</Button></div> : <Button className="mt-3 w-full" disabled={!selectedBbox || roadArea>200} onClick={()=>loadRoads()}><Download /> Download roads & places</Button>}
        <p className="mt-2 text-xs text-muted-foreground">Offline routing uses downloaded roads. Travel times are estimates; turn restrictions may be incomplete.</p>
        {roadRegions.map(r=><div key={r.id} className="mt-3 flex items-center gap-2 border-b py-3"><div className="min-w-0 flex-1"><div className="truncate font-display">{r.name}</div><div className="text-xs text-muted-foreground">{r.places.length.toLocaleString()} places · {r.roads.length.toLocaleString()} roads</div></div><Button variant="ghost" size="icon" title="Update region" aria-label={`Update roads for ${r.name}`} disabled={regionBusy} onClick={()=>loadRoads(r.bbox,r.name)}><RefreshCw /></Button><Button variant="ghost" size="icon" title="Delete region" aria-label={`Delete roads for ${r.name}`} onClick={async()=>{ await deleteRegion(r.id);setRoadRegions(await regions()); }}><Trash2 /></Button></div>)}
      </section>
      <section className="px-5 pt-6">
        <h2 className="smallcaps text-xs text-muted-foreground">Download the visible area</h2>
        <div className="hairline mt-2" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this area" aria-label="Area name" className="mt-3 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none" />
        <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Detail level">
          {LEVELS.map((l, i) => (
            <Button variant="ghost" key={l.z} role="radio" aria-checked={level === i} onClick={() => setLevel(i)} className={`flex-1 rounded-lg py-2 text-sm ${level === i ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{l.label}</Button>
          ))}
        </div>
        <p className="tnum mt-3 text-sm text-muted-foreground">
          {tooBig ? "This area is too large at this detail. Zoom in or pick less detail." : `About ${count.toLocaleString()} tiles, roughly ${mb(count * 35000)}.`}
        </p>
        {prog ? (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${(prog.done / prog.total) * 100}%` }} /></div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="tnum">{prog.done} / {prog.total}</span>
              <Button variant="ghost" onClick={() => { const p = !paused; setPaused(p); pausedRef.current = p; if (!p) run(); }} className="flex items-center gap-1 text-primary">
                {paused ? <><Play strokeWidth={1.5} className="h-4 w-4" /> Resume</> : <><Pause strokeWidth={1.5} className="h-4 w-4" /> Pause</>}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" disabled={tooBig || !bbox} onClick={start} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40">
            <Download strokeWidth={1.5} className="h-4 w-4" /> Download
          </Button>
        )}
      </section>
      <section className="px-5 pt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="smallcaps text-xs text-muted-foreground">Downloaded</h2>
          <span className="tnum text-xs text-muted-foreground">{mb(total)} used</span>
        </div>
        <div className="hairline mt-2" />
        {areas.length === 0 && <p className="py-3 text-sm text-muted-foreground">No areas yet.</p>}
        {areas.map((a) => (
          <div key={a.id} className="flex items-center gap-3 border-b py-3">
            <Button variant="ghost" className="min-w-0 flex-1 text-left" onClick={() => map?.fitBounds([[a.bbox[0], a.bbox[1]], [a.bbox[2], a.bbox[3]]])}>
              <div className="truncate font-display">{a.name}</div>
              <div className="tnum text-xs text-muted-foreground">{mb(a.bytes)} · {new Date(a.date).toLocaleDateString()}</div>
            </Button>
            <Button variant="ghost" onClick={() => remove(a)} aria-label={`Delete ${a.name}`} className="text-muted-foreground hover:text-destructive"><Trash2 strokeWidth={1.5} className="h-4 w-4" /></Button>
          </div>
        ))}
      </section>
    </div>
  );
}
