import { useEffect, useState } from "react";
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
import { AlertTriangle, Check, Flag, MapPin, ThumbsUp } from "lucide-react";

type Report = Database["public"]["Functions"]["nearby_road_reports"]["Returns"][number];
const categories = [ ["police", "Police"], ["accident", "Accident"], ["road_work", "Construction"], ["debris", "Debris"], ["pothole", "Pothole"], ["flooding", "Flooding"], ["ice_snow", "Ice / snow"], ["stalled_vehicle", "Stopped vehicle"], ["animal", "Animal"], ["other", "Other hazard"] ] as const;
type Category = typeof categories[number][0];
export function RoadReports() {
  const matchRoute = useMatchRoute();
  const showReportAction = !!matchRoute({ to: "/map" }) || !!matchRoute({ to: "/directions" });
  const { map, position, setPosition, navigating, picking, routes, activeRoute } = useMapState();
  const { user, consentNeeded } = useAccount();
  const [reports, setReports] = useState<Report[]>([]); const [selected, setSelected] = useState<Report | null>(null);
  const [open, setOpen] = useState(false); const [category, setCategory] = useState<Category>("other"); const [description, setDescription] = useState("");
  const [point, setPoint] = useState<[number, number] | null>(null); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [preview, setPreview] = useState(false);
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
        const el = document.createElement("button"); el.className = "report-marker"; el.textContent = "!"; el.setAttribute("aria-label", `${r.category.replaceAll("_", " ")} report`); el.title = r.category.replaceAll("_", " "); el.onclick = e => { e.stopPropagation(); setSelected(r); setMessage(""); };
        markers.push(new ml.Marker({ element: el }).setLngLat([r.lon,r.lat]).addTo(map));
      });
    });
    return () => { disposed = true; markers.forEach(m => m.remove()); };
  }, [map, reports]);
  const route = routes[activeRoute];
  const snap = position && route ? nearestOnLine([position.lon,position.lat], route.coords) : null;
  const ahead = navigating && position && route && snap ? reports.find(r => { const rs = nearestOnLine([r.lon,r.lat],route.coords); return Date.parse(r.expires_at)>Date.now() && rs.distance<80 && rs.along>snap.along && rs.along-snap.along<2000 && haversine([position.lon,position.lat],[r.lon,r.lat])<2000; }) : null;
  const start = async () => { setOpen(true); setPreview(false); setMessage(""); const p = position ?? await location.once().catch(() => null); if (p) { setPosition(p); setPoint([p.lon,p.lat]); } else { setPoint(null); setMessage("Allow location access to attach your current location."); } };
  return <>
    {!picking && showReportAction && <div className={`absolute right-4 z-40 ${navigating ? "top-40 md:top-5" : "bottom-24 md:bottom-5"}`}><Button variant="outline" className="glass h-11" onClick={start}><AlertTriangle strokeWidth={1.5} className="h-4 w-4" /> Report</Button></div>}
    {ahead && <div className="absolute right-4 top-56 z-40 max-w-[240px] md:top-20"><Button variant="outline" className="glass h-auto whitespace-normal text-left" onClick={() => setSelected(ahead)}><AlertTriangle strokeWidth={1.5} className="shrink-0" /><span>{ahead.category.replaceAll("_", " ")} ahead · community report</span></Button></div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>{preview ? "Confirm your report" : "Report a road alert"}</DialogTitle><DialogDescription>Public location and report · {category === "police" || category === "animal" || category === "stalled_vehicle" ? "30-minute" : "2-hour"} expiry. Up to 5 reports per hour.</DialogDescription>
      {!user || consentNeeded ? <Button asChild><Link to="/auth">{user ? "Choose privacy preferences" : "Sign in to report"}</Link></Button> : <>
        <label className="text-sm">Alert<select className="mt-1 h-11 w-full rounded-lg border bg-background px-3" value={category} disabled={preview} onChange={e => setCategory(e.target.value as Category)}>{categories.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label className="text-sm">Details<textarea className="mt-1 w-full rounded-lg border bg-background p-3" rows={3} maxLength={500} value={description} readOnly={preview} onChange={e => setDescription(e.target.value)} /></label><p className="text-xs text-muted-foreground">{description.length}/500</p>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin strokeWidth={1.5} className="h-4 w-4" />{point ? `${point[1].toFixed(5)}, ${point[0].toFixed(5)}` : "Location unavailable"}</p>
        <div className="flex gap-2">{preview && <Button variant="outline" onClick={() => setPreview(false)}>Edit</Button>}<Button disabled={!point || busy} onClick={async () => { if (!preview) { setPreview(true); return; } if (!point) return; setBusy(true); try { await post({ data: { lon: point[0], lat: point[1], category, description } }); setOpen(false); setDescription(""); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not post. Retry."); } setBusy(false); }}>{busy ? "Posting…" : preview ? "Post alert" : "Review report"}</Button></div>
      </>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </DialogContent></Dialog>
    <Dialog open={!!selected} onOpenChange={v => { if (!v) setSelected(null); }}><DialogContent><DialogTitle>{selected?.category.replaceAll("_", " ")}</DialogTitle><DialogDescription>Community report · expires {selected ? new Date(selected.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</DialogDescription><p className="text-sm">{selected?.description || "Reported by a Meridian traveler."}</p><p className="text-xs text-muted-foreground">{selected?.confirmations ?? 0} confirmations</p>{user ? <div className="flex flex-wrap gap-2">{([ ["confirm", "Still there", ThumbsUp], ["gone", "Gone", Check], ["flag", "Flag report", Flag] ] as const).map(([kind,label,Icon]) => <Button key={kind} variant="outline" disabled={busy} onClick={async () => { if (!selected) return; setBusy(true); try { await vote({ data: { report_id: selected.id, kind } }); setMessage("Thanks. Your feedback was recorded."); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not save feedback."); } setBusy(false); }}><Icon strokeWidth={1.5} className="h-4 w-4" />{label}</Button>)}</div> : <Button asChild variant="outline"><Link to="/auth">Sign in to confirm or flag</Link></Button>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</DialogContent></Dialog>
  </>;
}