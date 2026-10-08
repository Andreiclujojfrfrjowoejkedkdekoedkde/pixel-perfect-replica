import { createFileRoute, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MapProvider, useMapState } from "@/components/map/MapContext";
import { MapCanvas } from "@/components/map/MapCanvas";
import { Controls } from "@/components/map/Controls";
import { SearchBar } from "@/components/search/SearchBar";
import { BottomSheet } from "@/components/shell/BottomSheet";
import { HomePanel } from "@/components/shell/HomePanel";
import { HomeScreen } from "@/components/shell/HomeScreen";
import { StreetViewer } from "@/components/map/StreetViewer";
import { SpeedPill } from "@/components/nav/SpeedPill";
import { NetworkBadge } from "@/components/shell/NetworkBadge";
import { GlassDefs } from "@/components/glass/GlassDefs";
import { useSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { RoadReports } from "@/components/map/RoadReports";
import { TrafficLayer } from "@/components/map/TrafficLayer";
import { ChevronLeft, ChevronRight, MapPin, X } from "lucide-react";

export const Route = createFileRoute("/_map")({
  component: MapLayout,
});

function useBreakpoint() {
  const [bp, setBp] = useState<"sm" | "md" | "xl">("sm");
  useEffect(() => {
    const f = () => setBp(innerWidth >= 1200 ? "xl" : innerWidth >= 768 ? "md" : "sm");
    f();
    addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, []);
  return bp;
}

function MapLayout() {
  const { settings } = useSettings();
  return (
    <MapProvider initialMode={settings.defaultMode}>
      <Shell />
    </MapProvider>
  );
}

function Shell() {
  const bp = useBreakpoint();
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const { map, navigating, picking, cancelPick } = useMapState();
  const searchRef = useRef<HTMLInputElement>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isHome = !!matchRoute({ to: "/" });
  const isMap = !!matchRoute({ to: "/map" });
  const isPlace = !!matchRoute({ to: "/place/$id" });
  const isSettings = !!matchRoute({ to: "/settings" });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key.toLowerCase() === "l") setLayersOpen((o) => !o);
      else if (e.key === "+" || e.key === "=") map?.zoomIn();
      else if (e.key === "-") map?.zoomOut();
      else if (e.key === "Escape") { if (layersOpen) setLayersOpen(false); else if (!isHome && !navigating) navigate({ to: "/" }); }
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [map, layersOpen, isHome, navigating, navigate]);

  const panelContent = bp === "xl" && isPlace ? <HomePanel /> : isMap ? <HomePanel /> : <Outlet />;

  if (isHome) return <main className="fixed inset-0 overflow-hidden bg-background"><GlassDefs /><div className="homepage-map absolute inset-0"><MapCanvas /></div><HomeScreen /></main>;

  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      <GlassDefs />
      <MapCanvas />
      <NetworkBadge />
      {!navigating && <Controls layersOpen={layersOpen} setLayersOpen={setLayersOpen} />}
      <SpeedPill />
      <StreetViewer />
      <RoadReports />
      <TrafficLayer />
      {picking && <div className="pointer-events-none absolute inset-x-3 top-4 z-50 flex justify-center">
        <div className="glass pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3">
          <MapPin className="h-5 w-5 text-primary" strokeWidth={1.5} />
          <span className="text-sm">Choose {picking} on the map</span>
          <Button variant="ghost" size="icon" onClick={cancelPick} title="Cancel selection" aria-label="Cancel selection"><X /></Button>
        </div>
      </div>}


      {bp === "sm" && (
        <>
          {!navigating && !picking && (
            <div className="absolute inset-x-3 z-30" style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}>
              <SearchBar ref={searchRef} />
            </div>
          )}
          {(
            <div className={picking || navigating ? "hidden" : "contents"}><BottomSheet snap={isHome ? "peek" : isSettings ? "full" : "half"} title="Results and details">
              {isMap ? <HomePanel /> : <Outlet />}
            </BottomSheet></div>
          )}

        </>
      )}

      {bp !== "sm" && (
        <>
          {(
            <aside
              className={`absolute bottom-4 left-4 top-4 z-30 flex flex-col gap-3 transition-transform duration-300 ${bp === "xl" ? "w-[400px]" : "w-[360px]"} ${collapsed ? "-translate-x-[calc(100%+1rem)]" : ""} ${picking || navigating ? "hidden" : ""}`}
            >
              <SearchBar ref={searchRef} />
              <div className={`glass min-h-0 overflow-hidden rounded-2xl ${isMap ? "flex-none" : "flex-1"}`}>
                <div className={isMap ? "home-scroll relative overflow-y-auto" : "surface h-full overflow-y-auto"}>{panelContent}</div>
              </div>
              {bp === "xl" && (
                <Button variant="ghost"
                  onClick={() => setCollapsed(!collapsed)}
                  aria-label={collapsed ? "Show panel" : "Hide panel"}
                  className="glass absolute -right-9 top-16 flex h-12 w-7 items-center justify-center rounded-r-xl"
                >
                  {collapsed ? <ChevronRight strokeWidth={1.5} className="h-4 w-4" /> : <ChevronLeft strokeWidth={1.5} className="h-4 w-4" />}
                </Button>
              )}
            </aside>
          )}
          {bp === "xl" && isPlace && !navigating && !picking && (
            <aside className="glass absolute bottom-4 right-20 top-4 z-30 w-[380px] overflow-hidden rounded-2xl">
              <div className="surface h-full overflow-y-auto"><Outlet /></div>
            </aside>
          )}

        </>
      )}
    </main>
  );
}
