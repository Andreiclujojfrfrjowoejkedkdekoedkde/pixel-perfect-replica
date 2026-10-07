import { createFileRoute, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MapProvider, useMapState } from "@/components/map/MapContext";
import { MapCanvas } from "@/components/map/MapCanvas";
import { Controls } from "@/components/map/Controls";
import { SearchBar } from "@/components/search/SearchBar";
import { BottomSheet } from "@/components/shell/BottomSheet";
import { HomePanel } from "@/components/shell/HomePanel";
import { StreetViewer } from "@/components/map/StreetViewer";
import { SpeedPill } from "@/components/nav/SpeedPill";
import { SpeedLimitsProvider } from "@/components/nav/SpeedLimitsContext";
import { SpeedLimitSigns } from "@/components/map/SpeedLimitSigns";
import { HazardProvider } from "@/lib/hazardsStore";
import { HazardMarkers, HazardReporter } from "@/components/hazard/HazardReporter";
import { NetworkBadge } from "@/components/shell/NetworkBadge";
import { SyncBadge } from "@/components/shell/SyncBadge";
import { GlassDefs } from "@/components/glass/GlassDefs";
import { useSettings } from "@/lib/settings";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
      <SpeedLimitsProvider>
        <HazardProvider>
          <Shell />
        </HazardProvider>
      </SpeedLimitsProvider>
    </MapProvider>
  );
}

function Shell() {
  const bp = useBreakpoint();
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const { map, navigating } = useMapState();
  const searchRef = useRef<HTMLInputElement>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isHome = !!matchRoute({ to: "/" });
  const isPlace = !!matchRoute({ to: "/place/$id" });
  const isSettings = !!matchRoute({ to: "/settings" });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key.toLowerCase() === "l") setLayersOpen((o) => !o);
      else if (e.key === "+" || e.key === "=") map?.zoomIn();
      else if (e.key === "-") map?.zoomOut();
      else if (e.key === "Escape") {
        if (layersOpen) setLayersOpen(false);
        else if (!isHome && !navigating) navigate({ to: "/" });
      }
    };
    addEventListener("keydown", h);
    return () => removeEventListener("keydown", h);
  }, [map, layersOpen, isHome, navigating, navigate]);

  const panelContent = bp === "xl" && isPlace ? <HomePanel /> : isHome ? <HomePanel /> : <Outlet />;

  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      <GlassDefs />
      <MapCanvas />
      <SpeedLimitSigns />
      <HazardMarkers />
      <NetworkBadge />
      <SyncBadge />
      {!navigating && <Controls layersOpen={layersOpen} setLayersOpen={setLayersOpen} />}
      <SpeedPill />
      <HazardReporter />
      <StreetViewer />

      {bp === "sm" && (
        <>
          {!navigating && (
            <div
              className="absolute inset-x-3 z-30"
              style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
            >
              <SearchBar ref={searchRef} />
            </div>
          )}
          {!navigating && (
            <BottomSheet
              snap={isHome ? "peek" : isSettings ? "full" : "half"}
              title="Results and details"
            >
              {isHome ? <HomePanel /> : <Outlet />}
            </BottomSheet>
          )}
          {navigating && <Outlet />}
        </>
      )}

      {bp !== "sm" && (
        <>
          {!navigating && (
            <aside
              className={`absolute bottom-4 left-4 top-4 z-30 flex flex-col gap-3 transition-transform duration-300 ${bp === "xl" ? "w-[400px]" : "w-[360px]"} ${collapsed ? "-translate-x-[calc(100%+1rem)]" : ""}`}
            >
              <SearchBar ref={searchRef} />
              <div className="glass min-h-0 flex-1 overflow-hidden rounded-2xl">
                <div className="surface h-full overflow-y-auto">{panelContent}</div>
              </div>
              {bp === "xl" && (
                <button
                  onClick={() => setCollapsed(!collapsed)}
                  aria-label={collapsed ? "Show panel" : "Hide panel"}
                  className="glass absolute -right-9 top-16 flex h-12 w-7 items-center justify-center rounded-r-xl"
                >
                  {collapsed ? (
                    <ChevronRight strokeWidth={1.5} className="h-4 w-4" />
                  ) : (
                    <ChevronLeft strokeWidth={1.5} className="h-4 w-4" />
                  )}
                </button>
              )}
            </aside>
          )}
          {bp === "xl" && isPlace && !navigating && (
            <aside className="glass absolute bottom-4 right-20 top-4 z-30 w-[380px] overflow-hidden rounded-2xl">
              <div className="surface h-full overflow-y-auto">
                <Outlet />
              </div>
            </aside>
          )}
          {navigating && <Outlet />}
        </>
      )}
    </main>
  );
}
