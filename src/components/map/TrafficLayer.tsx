import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { trafficTile } from "@/lib/travel.functions";
import { useSettings, env } from "@/lib/settings";
import { useMapState } from "./MapContext";
export function TrafficLayer({ enabled, quiet = false }: { enabled?: boolean; quiet?: boolean } = {}) {
  const { map, styleVersion, navigating } = useMapState(); const { settings } = useSettings(); const check=useServerFn(trafficTile); const [available,setAvailable]=useState(Boolean(env.tomtom)); const [failed,setFailed]=useState(false);
  const showTraffic = enabled ?? settings.liveTraffic;
  useEffect(() => { void check().then(r => setAvailable(r.available || Boolean(env.tomtom))).catch(() => {}); }, [check]);
  useEffect(() => {
    if(!map || !map.getStyle()?.layers) return;
    if (!showTraffic || !available) { if(map.getLayer("live-traffic")) map.removeLayer("live-traffic"); if(map.getSource("live-traffic")) map.removeSource("live-traffic"); return; }
    const source = () => { if(!map.getSource("live-traffic")) map.addSource("live-traffic", { type: "raster", tiles: [env.tomtom ? `https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=${encodeURIComponent(env.tomtom)}&tileSize=256` : `${window.location.origin}/api/traffic/{z}/{x}/{y}`], tileSize: 256, minzoom: 5, maxzoom: 18, attribution: "Traffic © TomTom" }); if(!map.getLayer("live-traffic")) map.addLayer({ id: "live-traffic", type: "raster", source: "live-traffic", paint: { "raster-opacity": 0.8 } }); };
    source(); const onError=(e: { sourceId?: string }) => { if(e.sourceId==="live-traffic") setFailed(true); }; map.on("error",onError);
    const timer=window.setInterval(() => { if(document.hidden) return; if(map.getLayer("live-traffic")) map.removeLayer("live-traffic"); if(map.getSource("live-traffic")) map.removeSource("live-traffic"); setFailed(false); source(); },60000);
    return () => { clearInterval(timer); map.off("error",onError); try { if(map.getLayer("live-traffic")) map.removeLayer("live-traffic"); if(map.getSource("live-traffic")) map.removeSource("live-traffic"); } catch { /* map disposed */ } };
  }, [map,styleVersion,showTraffic,available]);
  return !quiet && showTraffic && (!available || failed) ? <div role="status" className={`pointer-events-none absolute right-4 z-30 max-w-52 text-xs ${navigating ? "bottom-48" : "bottom-40"}`}><span className="glass block rounded-lg p-3">{available ? "Live traffic unavailable · retrying" : "Live traffic needs a TomTom connection"}</span></div> : null;
}