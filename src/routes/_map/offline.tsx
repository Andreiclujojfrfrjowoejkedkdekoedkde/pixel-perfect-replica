import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { X, Trash2, Pause, Play, Download } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
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
const LEVELS = [{ z: 10, label: "Overview" }, { z: 13, label: "Standard" }, { z: 15, label: "Full detail" }];
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
  const { map } = useMapState();
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
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    if (!map) return;
    const f = () => { const b = map.getBounds(); setBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]); };
    f(); map.on("moveend", f);
    return () => { map.off("moveend", f); };
  }, [map]);

  const count = bbox ? tilesFor(bbox, 0, LEVELS[level].z).length : 0;
  const tooBig = count > 12000;
  const save = (a: Area[]) => { setAreas(a); storage.set("areas", a); };

  const run = async () => {
    const cache = await caches.open(CACHE);
    const q = queue.current!;
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
    if (!bbox || tooBig) return;
    const tj = await fetch("https://tiles.openfreemap.org/planet").then((r) => r.json());
    const tpl: string = tj.tiles[0];
    const urls = tilesFor(bbox, 0, Math.min(LEVELS[level].z, 14)).map(([z, x, y]) => tpl.replace("{z}", `${z}`).replace("{x}", `${x}`).replace("{y}", `${y}`));
    for (const f of ["Noto Sans Regular", "Noto Sans Bold", "Noto Sans Italic"]) for (const r of ["0-255", "256-511"]) urls.push(`https://tiles.openfreemap.org/fonts/${encodeURIComponent(f)}/${r}.pbf`);
    urls.push("https://tiles.openfreemap.org/planet");
    const area: Area = { id: `${Date.now()}`, name: name || `Area near ${map!.getCenter().lat.toFixed(2)}, ${map!.getCenter().lng.toFixed(2)}`, bbox, maxZoom: LEVELS[level].z, tiles: urls.length, bytes: 0, date: new Date().toISOString() };
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
        <button onClick={() => navigate({ to: "/" })} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X strokeWidth={1.5} /></button>
      </header>
      <section className="px-5 pt-4">
        <h2 className="smallcaps text-xs text-muted-foreground">Download the visible area</h2>
        <div className="hairline mt-2" />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this area" aria-label="Area name" className="mt-3 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none" />
        <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Detail level">
          {LEVELS.map((l, i) => (
            <button key={l.z} role="radio" aria-checked={level === i} onClick={() => setLevel(i)} className={`flex-1 rounded-lg py-2 text-sm ${level === i ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{l.label}</button>
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
              <button onClick={() => { const p = !paused; setPaused(p); pausedRef.current = p; if (!p) run(); }} className="flex items-center gap-1 text-primary">
                {paused ? <><Play strokeWidth={1.5} className="h-4 w-4" /> Resume</> : <><Pause strokeWidth={1.5} className="h-4 w-4" /> Pause</>}
              </button>
            </div>
          </div>
        ) : (
          <button disabled={tooBig || !bbox} onClick={start} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40">
            <Download strokeWidth={1.5} className="h-4 w-4" /> Download
          </button>
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
            <button className="min-w-0 flex-1 text-left" onClick={() => map?.fitBounds([[a.bbox[0], a.bbox[1]], [a.bbox[2], a.bbox[3]]])}>
              <div className="truncate font-display">{a.name}</div>
              <div className="tnum text-xs text-muted-foreground">{mb(a.bytes)} · {new Date(a.date).toLocaleDateString()}</div>
            </button>
            <button onClick={() => remove(a)} aria-label={`Delete ${a.name}`} className="text-muted-foreground hover:text-destructive"><Trash2 strokeWidth={1.5} className="h-4 w-4" /></button>
          </div>
        ))}
      </section>
    </div>
  );
}
