import { createElement, useEffect, useMemo, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useServerFn } from "@tanstack/react-start";
import { Link, useMatchRoute } from "@tanstack/react-router";
import type { Marker } from "maplibre-gl";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useMapState } from "./MapContext";
import { useAccount } from "@/lib/account";
import { postRoadReport, voteRoadReport } from "@/lib/travel.functions";
import { location } from "@/lib/platform";
import { haversine, nearestOnLine } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle, Check, Flag, MapPin, ThumbsUp, Shield, Car, Construction, Layers, CircleDot, Waves, Snowflake, CarFront, PawPrint, LoaderCircle } from "lucide-react";

type Report = Database["public"]["Functions"]["nearby_road_reports"]["Returns"][number];
const categories = [ ["police", "Police", Shield], ["accident", "Accident", Car], ["road_work", "Construction", Construction], ["debris", "Debris", Layers], ["pothole", "Pothole", CircleDot], ["flooding", "Flooding", Waves], ["ice_snow", "Ice / snow", Snowflake], ["stalled_vehicle", "Stopped vehicle", CarFront], ["animal", "Animal", PawPrint], ["other", "Other hazard", AlertTriangle] ] as const;
type Category = typeof categories[number][0];
export function RoadReports() {
  const matchRoute = useMatchRoute();
  const showReportAction = !!matchRoute({ to: "/map" }) || !!matchRoute({ to: "/directions" });
  const { map, position, setPosition, navigating, picking, routes, activeRoute } = useMapState();
  const { user, consentNeeded } = useAccount();
  const [reports, setReports] = useState<Report[]>([]); const [selected, setSelected] = useState<Report | null>(null);
  const [open, setOpen] = useState(false); const [postingCategory, setPostingCategory] = useState<Category | null>(null);
  const [point, setPoint] = useState<[number, number] | null>(null); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const post = useServerFn(postRoadReport); const vote = useServerFn(voteRoadReport);
  useEffect(() => {
    if (!map) return;
    let live = true; let timer: ReturnType<typeof setTimeout>;
    const load = async () => { const b = map.getBounds(); if (b.getEast()-b.getWest() > 2 || b.getNorth()-b.getSouth() > 2) { setReports([]); return; } const result = await supabase.rpc("nearby_road_reports", { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }); if (live && !result.error) setReports(result.data ?? []); };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void load(); }, 600); };
    void load(); map.on("moveend", schedule); const interval = window.setInterval(load, 30000);
    const channel = supabase.channel("visible-road-reports").on("postgres_changes", { event: "*", schema: "public", table: "road_reports" }, schedule).subscribe();
    return () => { live = false; clearTimeout(timer); clearInterval(interval); map.off("moveend", schedule); void supabase.removeChannel(channel); };
  }, [map]);
  useEffect(() => {
    if (!map) return;
    let disposed = false; const markers: Marker[] = [];
    void import("maplibre-gl").then(ml => {
      if (disposed) return;
      reports.filter(r => Date.parse(r.expires_at) > Date.now()).forEach(r => {
        const category = categories.find(([id]) => id === r.category);
        const Icon = category?.[2] ?? AlertTriangle;
        const label = category?.[1] ?? "Other hazard";
        const el = document.createElement("button"); el.type = "button"; el.className = "report-marker";
        el.innerHTML = renderToStaticMarkup(createElement(Icon, { size: 19, strokeWidth: 1.5, "aria-hidden": true }));
        el.setAttribute("aria-label", `${label} report`); el.title = label; el.onclick = e => { e.stopPropagation(); setSelected(r); setMessage(""); };
        markers.push(new ml.Marker({ element: el }).setLngLat([r.lon,r.lat]).addTo(map));
      });
    });
    return () => { disposed = true; markers.forEach(m => m.remove()); };
  }, [map, reports]);
  const route = routes[activeRoute];
  const reportSnaps = useMemo(() => navigating && route ? reports.map(report => ({ report, snap: nearestOnLine([report.lon, report.lat], route.coords) })) : [], [navigating, route, reports]);
  const snap = useMemo(() => navigating && position && route ? nearestOnLine([position.lon,position.lat], route.coords) : null, [navigating, position, route]);
  const ahead = position && snap ? reportSnaps.find(({ report: r, snap: rs }) => Date.parse(r.expires_at)>Date.now() && rs.distance<80 && rs.along>snap.along && rs.along-snap.along<2000 && haversine([position.lon,position.lat],[r.lon,r.lat])<2000)?.report : null;
  const start = async () => { setOpen(true); setMessage(""); const p = position ?? await location.once().catch(() => null); if (p) { setPosition(p); setPoint([p.lon,p.lat]); } else { setPoint(null); setMessage("Allow location access to attach your current location."); } };
  return <>
    {!picking && showReportAction && <div className={`absolute right-4 z-40 ${navigating ? "top-40 md:top-5" : "bottom-24 md:bottom-5"}`}><Button variant="outline" className="glass h-11" onClick={start}><AlertTriangle strokeWidth={1.5} className="h-4 w-4" /> Report</Button></div>}
    {ahead && <div className="absolute right-4 top-56 z-40 max-w-[240px] md:top-20"><Button variant="outline" className="glass h-auto whitespace-normal text-left" onClick={() => setSelected(ahead)}><AlertTriangle strokeWidth={1.5} className="shrink-0" /><span>{ahead.category.replaceAll("_", " ")} ahead · community report</span></Button></div>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="glass w-[calc(100%-2rem)] max-w-[360px] gap-3 rounded-lg p-4 sm:max-w-[360px]" aria-busy={busy}><DialogTitle className="text-lg">Report an alert</DialogTitle><DialogDescription className="text-xs">Public alert · expires in 30 min–2 h</DialogDescription>
      <div className="grid grid-cols-2 gap-2">
        {categories.map(([id, label, Icon]) => <Button key={id} variant="outline" className="glass h-14 justify-start gap-3 px-3 text-xs hover:text-primary [&_svg]:size-5" disabled={!user || consentNeeded || !point || busy} onClick={async () => {
          if (!point || busy || !user || consentNeeded) return;
          setBusy(true); setPostingCategory(id); setMessage("");
          try { await post({ data: { lon: point[0], lat: point[1], category: id, description: "" } }); setOpen(false); }
          catch (e) { setMessage(e instanceof Error ? e.message : "Could not post. Retry."); }
          finally { setBusy(false); setPostingCategory(null); }
        }}>{postingCategory === id ? <LoaderCircle strokeWidth={1.5} className="animate-spin motion-reduce:animate-none" /> : <Icon strokeWidth={1.5} />}<span>{label}</span></Button>)}
      </div>
      {!user || consentNeeded ? <Button asChild size="sm"><Link to="/auth">{user ? "Choose privacy preferences" : "Sign in to report"}</Link></Button> : <p className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin strokeWidth={1.5} className="h-3.5 w-3.5" />{point ? "Current location attached" : "Locating…"}</p>}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </DialogContent></Dialog>
    <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}><DialogContent><DialogTitle>{selected?.category.replaceAll("_", " ")}</DialogTitle><DialogDescription>Community report · expires {selected ? new Date(selected.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</DialogDescription><p className="text-sm">{selected?.description || "Reported by a Meridian traveler."}</p><p className="text-xs text-muted-foreground">{selected?.confirmations ?? 0} confirmations</p>{user ? <div className="flex flex-wrap gap-2">{([ ["confirm", "Still there", ThumbsUp], ["gone", "Gone", Check], ["flag", "Flag report", Flag] ] as const).map(([kind,label,Icon]) => <Button key={kind} variant="outline" disabled={busy} onClick={async () => { if (!selected) return; setBusy(true); try { await vote({ data: { report_id: selected.id, kind } }); setMessage("Thanks. Your feedback was recorded."); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save feedback."); } setBusy(false); }}><Icon strokeWidth={1.5} className="h-4 w-4" />{label}</Button>)}</div> : <Button asChild variant="outline"><Link to="/auth">Sign in to confirm or flag</Link></Button>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</DialogContent></Dialog>
  </>;
}