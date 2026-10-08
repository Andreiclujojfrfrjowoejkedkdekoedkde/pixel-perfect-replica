import { useEffect, useState } from "react";
import { PlugZap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { categorySearch, type Place, type Route } from "@/lib/services";
import { haversine, nearestOnLine, fmtDistance } from "@/lib/format";
import { useSettings } from "@/lib/settings";
export function ChargerStops({ route, add }: { route: Route; add: (place: Place) => void }) {
  const { settings } = useSettings(); const [chargers, setChargers] = useState<Place[]>([]); const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setChargers([]);
    const budget = settings.evRangeKm * 1000 * 0.8;
    if (route.distance <= budget) { setMessage("Within your estimated range, with a 20% reserve."); return; }
    const load = async () => {
      setMessage("Finding charging stops along the route…");
      try {
        const targets: [number,number][] = []; let along = 0, next = budget;
        for (let i=1; i<route.coords.length && targets.length<8; i++) { const a=route.coords[i-1], b=route.coords[i]; if (!a || !b) continue; along += haversine(a,b); if (along >= next) { targets.push(b); next += budget; } }
        const found: Place[] = [];
        for (const p of targets) { if (controller.signal.aborted) return; const candidates = await categorySearch('["amenity"="charging_station"]', [p[0]-0.08,p[1]-0.06,p[0]+0.08,p[1]+0.06], controller.signal); candidates.sort((a,b) => nearestOnLine([a.lon,a.lat],route.coords).distance-nearestOnLine([b.lon,b.lat],route.coords).distance); const best=candidates.find(c => nearestOnLine([c.lon,c.lat],route.coords).distance<5000); if(best) found.push(best); }
        if (!controller.signal.aborted) { setChargers([...new Map(found.map(p => [p.id,p])).values()]); setMessage(found.length ? "Suggested stops · connector compatibility and availability unverified; charging time is not included." : "No suitable chargers found near the range checkpoints. Add a known charger before traveling."); }
      } catch { if (!controller.signal.aborted) setMessage("Charger search unavailable. Check a known charger or retry."); }
    };
    void load(); return () => controller.abort();
  }, [route, settings.evRangeKm]);
  return <section className="mt-4 border-t py-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><PlugZap strokeWidth={1.5} className="h-4 w-4 text-primary" /> EV charging · {settings.evRangeKm} km range</h2><p className="mt-2 text-xs text-muted-foreground">{message}</p>{chargers.map(p => <div key={p.id} className="mt-3 flex items-center gap-2"><span className="min-w-0 flex-1 text-sm"><span className="block truncate">{p.name}</span><span className="text-xs text-muted-foreground">{fmtDistance(nearestOnLine([p.lon,p.lat],route.coords).along,settings.units)} along route</span></span><Button variant="outline" size="sm" onClick={() => add(p)}><Plus strokeWidth={1.5} className="h-4 w-4" /> Add stop</Button></div>)}</section>;
}