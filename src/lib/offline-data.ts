import createGraph from "ngraph.graph";
import { aStar } from "ngraph.path";
import { haversine } from "./format";
import type { Place, Route, RoutingEngine } from "./services";

export type Bbox = [number, number, number, number];
type Road = { id: number; nodes: number[]; tags: Record<string, string> };
export type OfflineRegion = { id: string; name: string; bbox: Bbox; date: string; places: Place[]; nodes: Record<string, [number, number]>; roads: Road[] };
type Element = { id: number; type: string; lat?: number; lon?: number; center?: { lat: number; lon: number }; nodes?: number[]; tags?: Record<string, string> };

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("meridian-regions", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("regions", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Offline storage is unavailable."));
  });
}
export async function regions(): Promise<OfflineRegion[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("regions", "readonly");
    const req = tx.objectStore("regions").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error("Could not read downloaded regions."));
    tx.oncomplete = () => db.close();
  });
}
async function write(region: OfflineRegion | string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("regions", "readwrite");
    if (typeof region === "string") tx.objectStore("regions").delete(region);
    else tx.objectStore("regions").put(region);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(new Error("Not enough storage for this region.")); };
  });
}
export const deleteRegion = (id: string) => write(id);
export function inside(p: [number, number], bbox: Bbox) { return p[0] >= bbox[0] && p[0] <= bbox[2] && p[1] >= bbox[1] && p[1] <= bbox[3]; }
export function regionArea(b: Bbox) { return haversine([b[0], b[1]], [b[2], b[1]]) * haversine([b[0], b[1]], [b[0], b[3]]) / 1e6; }

export async function overpass(query: string, signal?: AbortSignal): Promise<{ elements: Element[] }> {
  for (const host of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const timeout = AbortSignal.timeout(25000);
    try {
      const r = await fetch(host, { method: "POST", body: new URLSearchParams({ data: query }), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
      if (!r.ok) continue;
      const data = await r.json();
      if (data.remark || !Array.isArray(data.elements)) continue;
      return data;
    } catch (e) { if (signal?.aborted) throw e; }
  }
  throw new Error("Places service is busy. Please retry.");
}

export async function downloadRegion(name: string, bbox: Bbox, signal?: AbortSignal) {
  if (regionArea(bbox) > 200) throw new Error("Select an area smaller than 200 km² for offline roads and places.");
  const b = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
  const data = await overpass(`[out:json][timeout:20];(way[highway](${b});>;);out body; (nwr[amenity](${b});nwr[tourism](${b});nwr[shop](${b});nwr["addr:housenumber"](${b}););out center tags;`, signal);
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const nodes: OfflineRegion["nodes"] = {}, roads: Road[] = [], places: Place[] = [];
  for (const e of data.elements) {
    if (e.type === "node" && e.lat != null && e.lon != null) nodes[String(e.id)] = [e.lon, e.lat];
    const t = e.tags ?? {};
    if (e.type === "way" && t.highway && e.nodes) roads.push({ id: e.id, nodes: e.nodes, tags: t });
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null || !(t.amenity || t.tourism || t.shop || t["addr:housenumber"])) continue;
    const kind = t.amenity ?? t.tourism ?? t.shop ?? "Address";
    places.push({ id: `${e.type === "node" ? "N" : e.type === "way" ? "W" : "R"}${e.id}`, name: t.name ?? t.brand ?? ([t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") || kind.replaceAll("_", " ")), subtitle: [t["addr:street"], t["addr:city"]].filter(Boolean).join(", "), kind: kind.replaceAll("_", " "), lat, lon });
  }
  if (!roads.length) throw new Error("No roads were found. Choose another area.");
  const region: OfflineRegion = { id: bbox.join(","), name, bbox, date: new Date().toISOString(), places: [...new Map(places.map(p => [p.id, p])).values()], nodes, roads };
  await write(region);
  return region;
}

export async function localSearch(q: string, center: [number, number]): Promise<Place[] | null> {
  const all = await regions();
  const available = navigator.onLine ? all.filter(r => inside(center, r.bbox)) : all;
  if (!available.length) return null;
  const terms = q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean);
  return [...new Map(available.flatMap(r => r.places).map(p => [p.id, p])).values()]
    .filter(p => { const text = `${p.name} ${p.subtitle} ${p.kind}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); return terms.every(t => text.includes(t)); })
    .sort((a,b) => haversine(center,[a.lon,a.lat]) - haversine(center,[b.lon,b.lat])).slice(0, 12);
}
export async function localCategory(id: string, center: [number, number]) {
  const types: Record<string, string[]> = { food: ["restaurant", "cafe", "fast food"], fuel: ["fuel"], parking: ["parking"], charging: ["charging station"], pharmacy: ["pharmacy"], lodging: ["hotel", "hostel", "guest house", "motel"] };
  const all = await regions();
  const available = all.filter(r => inside(center, r.bbox));
  if (!available.length) return null;
  return [...new Map(available.flatMap(r => r.places).filter(p => types[id]?.includes(p.kind)).map(p => [p.id,p])).values()];
}

export const offlineRouter: RoutingEngine = {
  name: "Offline regional roads",
  async route(stops, opts) {
    const region = (await regions()).find(r => stops.every(p => inside(p, r.bbox)));
    if (!region) throw new Error("Download roads for an area containing all your stops before routing offline.");
    const graph = createGraph<[number, number], { length: number; name: string }>();
    for (const road of region.roads) {
      const t = road.tags, h = t.highway;
      if (["private", "no"].includes(t.access ?? "") || t.area === "yes" || t.construction || ["construction", "proposed"].includes(h ?? "")) continue;
      const access = opts.mode === "drive" ? t.motor_vehicle ?? t.motorcar ?? t.vehicle : opts.mode === "cycle" ? t.bicycle : t.foot;
      if (["no", "private"].includes(access ?? "")) continue;
      if (opts.mode === "drive" && ["footway", "path", "pedestrian", "cycleway", "steps", "bridleway"].includes(h ?? "") && access !== "yes") continue;
      if (opts.mode !== "drive" && ["motorway", "motorway_link"].includes(h ?? "")) continue;
      if (opts.mode === "cycle" && h === "steps") continue;
      if (opts.avoidHighways && ["motorway", "motorway_link", "trunk", "trunk_link"].includes(h ?? "")) continue;
      if (opts.avoidTolls && t.toll === "yes") continue;
      if (opts.avoidUnpaved && ["gravel", "dirt", "ground", "unpaved", "sand"].includes(t.surface ?? "")) continue;
      const one = opts.mode === "walk" ? "no" : opts.mode === "cycle" && t["oneway:bicycle"] === "no" ? "no" : t.oneway ?? (t.junction === "roundabout" || h === "motorway" ? "yes" : "no");
      for (let i = 0; i < road.nodes.length - 1; i++) {
        const a = road.nodes[i], b = road.nodes[i+1];
        if (a == null || b == null) continue;
        const pa = region.nodes[String(a)], pb = region.nodes[String(b)];
        if (!pa || !pb) continue;
        graph.addNode(a, pa); graph.addNode(b, pb);
        const edge = { length: haversine(pa,pb), name: t.name ?? "Continue on this road" };
        if (one !== "-1") graph.addLink(a,b,edge);
        if (!["yes", "1", "true"].includes(one)) graph.addLink(b,a,edge);
      }
    }
    const nearest = (p: [number, number]) => {
      let id: string | number | null = null, distance = Infinity;
      graph.forEachNode(n => { const d = haversine(p,n.data); if (d < distance) { distance = d; id = n.id; } });
      if (id == null || distance > 250) throw new Error("A stop is too far from a downloaded accessible road.");
      return id;
    };
    const finder = aStar(graph, { oriented: true, distance: (_a,_b,l) => l.data.length, heuristic: (a,b) => haversine(a.data,b.data) });
    const coords: [number, number][] = [], maneuvers: Route["maneuvers"] = [];
    let distance = 0, lastName = "";
    const speed = opts.mode === "drive" ? 11.1 : opts.mode === "cycle" ? 4.2 : 1.4;
    for (let i=0;i<stops.length-1;i++) {
      const from=stops[i], to=stops[i+1];
      if (!from || !to) continue;
      const fromId=nearest(from), toId=nearest(to);
      const path = finder.find(fromId,toId).reverse();
      if (path.length < 2) throw new Error("No connected offline route found between these stops.");
      for (let j=0;j<path.length;j++) {
        const node=path[j], next=path[j+1]; if (!node) continue;
        if (next) {
          const edge=graph.getLink(node.id,next.id)?.data;
          if (edge) { distance+=edge.length; if (edge.name!==lastName) { maneuvers.push({ instruction: edge.name, street: edge.name, type: 8, length: edge.length, time: edge.length/speed, beginIndex: coords.length }); lastName=edge.name; } }
        }
        coords.push(node.data);
      }
    }
    maneuvers.push({ instruction: "You have reached your destination", street: "Destination", type: 4, length: 0, time: 0, beginIndex: coords.length-1 });
    return [{ coords, maneuvers, distance, duration: distance/speed, offline: true }];
  },
};