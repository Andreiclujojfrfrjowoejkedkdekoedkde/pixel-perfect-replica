import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { MapMode } from "@/lib/settings";
import type { Place, Route } from "@/lib/services";
import type { Position } from "@/lib/platform";

type MapState = {
  map: MLMap | null;
  setMap: (m: MLMap | null) => void;
  mode: MapMode;
  setMode: (m: MapMode) => void;
  styleVersion: number;
  bumpStyle: () => void;
  position: Position | null;
  setPosition: (p: Position | null) => void;
  markers: Place[];
  setMarkers: React.Dispatch<React.SetStateAction<Place[]>>;
  routes: Route[];
  activeRoute: number;
  setRoutes: (r: Route[], active?: number) => void;
  setActiveRoute: (i: number) => void;
  streetImage: string | null;
  setStreetImage: (id: string | null) => void;
  navigating: boolean;
  setNavigating: (b: boolean) => void;
  picking: string | null;
  pickPoint: ((coord: [number, number]) => void) | null;
  beginPick: (label: string, callback: (coord: [number, number]) => void) => void;
  cancelPick: () => void;
};

const Ctx = createContext<MapState | null>(null);

export function MapProvider({ children, initialMode }: { children: ReactNode; initialMode: MapMode }) {
  const [map, setMap] = useState<MLMap | null>(null);
  const [mode, setMode] = useState<MapMode>(initialMode);
  const [styleVersion, setSV] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const [markers, setMarkers] = useState<Place[]>([]);
  const [routes, setR] = useState<Route[]>([]);
  const [activeRoute, setActiveRoute] = useState(0);
  const [streetImage, setStreetImage] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [selection, setSelection] = useState<{ label: string; callback: (coord: [number, number]) => void } | null>(null);
  const bumpStyle = useCallback(() => setSV(v => v + 1), []);
  const setRoutes = useCallback((r: Route[], active = 0) => { setR(r); setActiveRoute(active); }, []);
  const beginPick = useCallback((label: string, callback: (coord: [number, number]) => void) => setSelection({ label, callback }), []);
  const cancelPick = useCallback(() => setSelection(null), []);
  const value = useMemo<MapState>(() => ({
    map, setMap, mode, setMode, styleVersion, bumpStyle, position, setPosition,
    markers, setMarkers, routes, activeRoute, setRoutes, setActiveRoute,
    streetImage, setStreetImage, navigating, setNavigating,
    picking: selection?.label ?? null, pickPoint: selection?.callback ?? null, beginPick, cancelPick,
  }), [map, mode, styleVersion, bumpStyle, position, markers, routes, activeRoute, setRoutes, streetImage, navigating, selection, beginPick, cancelPick]);
  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}

export function useMapState() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMapState outside MapProvider");
  return c;
}
