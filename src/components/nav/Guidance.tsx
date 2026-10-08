import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, CornerUpLeft, CornerUpRight, ArrowUpLeft, ArrowUpRight, RotateCcw, Flag, Crosshair, Volume2, VolumeX, X, LocateFixed } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { useSettings, type TravelMode } from "@/lib/settings";
import { routingEngine, type Route } from "@/lib/services";
import { location, tts, keepAwake } from "@/lib/platform";
import { fmtDistance, fmtDuration, fmtClock, haversine, nearestOnLine } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EtaShare } from "./EtaShare";
import { saveTrip } from "@/lib/trips";
import { useServerFn } from "@tanstack/react-start";
import { stopEtaShare } from "@/lib/travel.functions";

function ManeuverIcon({ type }: { type: number }) {
  const Icon = [4,5,6].includes(type) ? Flag : [10,11].includes(type) ? CornerUpRight : [14,15].includes(type) ? CornerUpLeft : [9,18,20,23].includes(type) ? ArrowUpRight : [16,19,21,24].includes(type) ? ArrowUpLeft : [12,13].includes(type) ? RotateCcw : ArrowUp;
  return <Icon strokeWidth={1.5} className="h-12 w-12 shrink-0 text-primary" />;
}

export function Guidance({ route: initial, destination, stops, mode, onEnd }: { route: Route; destination: [number, number]; stops: [number, number][]; mode: TravelMode; onEnd: () => void }) {
  const { map, position, setPosition, setRoutes } = useMapState();
  const { settings, update } = useSettings();
  const [route, setRoute] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [recalculating, setRecalculating] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const started = useRef(Date.now());
  const tripId = useRef<string | null>(null);
  const traveled = useRef(0);
  const lastAlong = useRef(0);
  const stopShare = useServerFn(stopEtaShare);
  const spoken = useRef("");
  const rerouting = useRef(false);
  const lastReroute = useRef(0);
  const stopIndex = useRef(1);

  useEffect(() => {
    const stop = location.watch(p => { setPosition(p); setError(null); }, setError);
    tripId.current = crypto.randomUUID();
    if (settings.keepScreenOn) void keepAwake.on();
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const origin = position ? [position.lon,position.lat] as [number,number] : route.coords[0];
    if (origin) try { map?.easeTo({ center: origin, pitch: 55, zoom: 17, duration: 800 }); } catch { /* camera unavailable */ }
    return () => { stop(); clearInterval(timer); tts.speak(""); void keepAwake.off(); try { map?.easeTo({ pitch: 0, bearing: 0, duration: 600 }); } catch { /* map removed */ } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map) return;
    const pause = (e: { originalEvent?: Event }) => { if (e.originalEvent) setFollowing(false); };
    map.on("dragstart", pause); map.on("rotatestart", pause); map.on("zoomstart", onZoom);
    function onZoom(e: { originalEvent?: Event }) { if (e.originalEvent) pause(e); }
    return () => { map.off("dragstart", pause); map.off("rotatestart", pause); map.off("zoomstart", onZoom); };
  }, [map]);

  const progress = useMemo(() => {
    if (!position || !Number.isFinite(position.lon) || !Number.isFinite(position.lat) || route.coords.length < 2) return null;
    const me: [number, number] = [position.lon,position.lat];
    const snap = nearestOnLine(me,route.coords);
    const next = route.maneuvers.find(m => m.beginIndex > snap.index) ?? route.maneuvers[route.maneuvers.length-1];
    if (!next) return null;
    let toNext = 0;
    for (let i=snap.index; i<Math.min(next.beginIndex,route.coords.length-1); i++) {
      const a=route.coords[i],b=route.coords[i+1]; if (a && b) toNext+=haversine(a,b)*(i===snap.index ? 1-snap.fraction : 1);
    }
    const remaining = Math.max(0,snap.total-snap.along);
    return { ...snap, off: snap.distance, next, toNext, remaining, me, timeLeft: snap.total ? remaining/snap.total*route.duration : 0, percent: snap.total ? Math.max(0,Math.min(100,snap.along/snap.total*100)) : 0 };
  }, [position,route]);
  useEffect(() => {
    if (!progress || progress.off > Math.max(50, position?.accuracy ?? 0)) return;
    const delta = progress.along - lastAlong.current;
    if (delta > 0 && delta < 2000) traveled.current += delta;
    lastAlong.current = progress.along;
  }, [progress, position?.accuracy]);

  const stale = !position || now-position.timestamp > 15000;
  useEffect(() => {
    if (!progress || !map || !following || stale) return;
    const ahead=route.coords[Math.min(progress.index+3,route.coords.length-1)];
    const h=position?.heading;
    let bearing=typeof h === "number" && Number.isFinite(h) ? h : ahead ? Math.atan2((ahead[0]-progress.me[0])*Math.cos(progress.me[1]*Math.PI/180),ahead[1]-progress.me[1])*180/Math.PI : map.getBearing();
    if (!Number.isFinite(bearing)) bearing=0;
    try { map.easeTo({ center: progress.me, bearing, zoom: 17, pitch: mode === "drive" ? 55 : 30, duration: 850 }); } catch { /* map unavailable */ }
  }, [progress,map,following,stale,mode,position?.heading]);

  useEffect(() => {
    if (!progress || stale || !settings.voice) return;
    const bucket=progress.toNext<80 ? "now" : progress.toNext<500 ? "soon" : "";
    const key=`${route.coords.length}-${progress.next.beginIndex}-${bucket}`;
    if (bucket && spoken.current!==key) {
      spoken.current=key;
      tts.speak(bucket === "now" ? progress.next.instruction : `In ${fmtDistance(progress.toNext,settings.units)}, ${progress.next.verbal ?? progress.next.instruction}`,settings.volume);
    }
  }, [progress,stale,settings.voice,settings.units,settings.volume,route]);

  useEffect(() => {
    if (!progress || stale || progress.off < Math.max(50,position?.accuracy ?? 0) || rerouting.current || Date.now()-lastReroute.current<20000) return;
    const nextStop=stops[stopIndex.current];
    if (nextStop && haversine(progress.me,nextStop)<45 && stopIndex.current<stops.length-1) stopIndex.current++;
    rerouting.current=true; setRecalculating(true); lastReroute.current=Date.now();
    const remainingStops=stops.slice(stopIndex.current);
    routingEngine.route([progress.me,...(remainingStops.length ? remainingStops : [destination])],{ mode,...settings })
      .then(r => { if (r[0]) { lastAlong.current=0; setRoute(r[0]); setRoutes([r[0]]); spoken.current=""; setError(null); } else setError("No new route found. Retry when connected."); })
      .catch(() => setError("Unable to reroute. Continue on the saved route or reconnect."))
      .finally(() => { rerouting.current=false; setRecalculating(false); });
  }, [progress,stale]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const next=stops[stopIndex.current];
    if (progress && next && haversine(progress.me,next)<45 && stopIndex.current<stops.length-1) stopIndex.current++;
  }, [progress,stops]);

  const arrived=Boolean(progress && !stale && progress.remaining<25 && haversine(progress.me,destination)<45);
  const eta=progress && !stale ? new Date(now+progress.timeLeft*1000) : null;
  const keep = !route.offline && progress && progress.toNext < 700 ? /\b(?:keep|stay|bear)\s+(?:to\s+(?:the\s+)?)?(left|right)\b/i.exec(progress.next.instruction)?.[1]?.toLowerCase() ?? ([18, 23].includes(progress.next.type) ? "right" : [19, 24].includes(progress.next.type) ? "left" : null) : null;
  const endTrip = async () => {
    setEnding(true);
    if (shareId) { try { await stopShare({ data: { id: shareId } }); } catch { setError("Could not stop sharing. Retry while connected, or stop it in Account. Link expires within 6 hours."); setEnding(false); return; } }
    if (settings.tripHistory && tripId.current) saveTrip({ id: tripId.current, started_at: new Date(started.current).toISOString(), ended_at: new Date().toISOString(), distance_m: traveled.current, duration_s: (Date.now()-started.current)/1000, completed: arrived });
    onEnd();
  };
  return <>
    <div className="guidance-top absolute inset-x-3 z-40 md:left-4 md:right-auto md:w-[420px]" aria-live="polite">
      <div className="glass flex items-center gap-4 rounded-2xl p-4">
        <ManeuverIcon type={arrived ? 4 : progress?.next.type ?? 8} />
        <div className="min-w-0 flex-1">
          <div className={`tnum font-semibold leading-none ${recalculating ? "text-xl" : "text-3xl"}`}>{recalculating ? "Recalculating…" : arrived ? "Arrived" : stale ? "Locating" : progress ? fmtDistance(progress.toNext,settings.units) : "Locating"}</div>
          <div className="mt-2 font-display text-lg leading-snug">{arrived ? "You have reached your destination" : progress?.next.street || progress?.next.instruction || "Waiting for GPS"}</div>
          <div className="mt-1 text-xs text-muted-foreground">{route.offline ? "Offline · estimated time" : mode === "drive" ? "Driving" : mode === "cycle" ? "Cycling" : "Walking"}{position && !stale && position.accuracy>50 ? " · GPS accuracy low" : ""}</div>
        </div>
        <Button variant="ghost" size="icon" aria-label={settings.voice ? "Mute voice" : "Enable voice"} title={settings.voice ? "Mute voice" : "Enable voice"} onClick={() => { update({ voice: !settings.voice }); if(settings.voice) tts.speak(""); }}>{settings.voice ? <Volume2 /> : <VolumeX />}</Button>
      </div>
      {keep && !stale && !recalculating && <div className="glass mt-2 flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold">{keep === "left" ? <ArrowUpLeft strokeWidth={1.5} /> : <ArrowUpRight strokeWidth={1.5} />} Keep {keep}<span className="ml-auto text-xs font-normal text-muted-foreground">Upcoming junction</span></div>}
      {recalculating && <div role="status" className="glass mt-2 rounded-lg px-4 py-2 text-sm text-primary">You’re off route · finding a new route</div>}
      {(error || (position && stale)) && <div className="glass mt-2 rounded-lg px-3 py-2 text-sm">{error ?? "GPS signal lost. Waiting for your location."}</div>}
    </div>
    {!following && <div className="absolute bottom-40 right-4 z-40 md:bottom-32"><Button className="glass h-11 text-foreground" variant="outline" onClick={() => setFollowing(true)}><Crosshair strokeWidth={1.5} /> Recenter</Button></div>}
    <div className="guidance-bottom absolute inset-x-3 bottom-3 z-40 md:left-4 md:right-auto md:w-[420px]">
      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b px-4 py-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><LocateFixed strokeWidth={1.5} className="h-3.5 w-3.5" />{following ? "Following your location" : "Map paused"}</span><span className="tnum">{Math.round(progress?.percent ?? 0)}% complete</span></div>
        <div className="grid grid-cols-3 gap-3 px-4 py-4">
          <div><div className="tnum text-2xl font-semibold text-primary">{eta ? fmtClock(eta,settings.timeFormat) : "—"}</div><div className="text-xs text-muted-foreground">Arrival</div></div>
          <div><div className="tnum text-lg font-semibold">{fmtDuration(progress?.timeLeft ?? route.duration)}</div><div className="text-xs text-muted-foreground">Remaining</div></div>
          <div><div className="tnum text-lg font-semibold">{fmtDistance(progress?.remaining ?? route.distance,settings.units)}</div><div className="text-xs text-muted-foreground">Distance</div></div>
        </div>
        <div className="flex items-center gap-3 px-4 pb-3"><progress aria-label="Trip progress" max="100" value={progress?.percent ?? 0} className="trip-progress h-1.5 min-w-0 flex-1" /><EtaShare eta={eta} seconds={progress?.timeLeft ?? route.duration} meters={progress?.remaining ?? route.distance} onActiveChange={setShareId} /><Button variant="destructive" size="sm" disabled={ending} onClick={endTrip}><X /> {ending ? "Ending…" : "End"}</Button></div>
      </div>
    </div>
  </>;
}
