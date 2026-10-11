import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { storage } from "./platform";

export type MapMode = "standard" | "3d" | "earth" | "street";
export type TravelMode = "drive" | "walk" | "cycle";

export type Settings = {
  units: "metric" | "imperial";
  theme: "light" | "dark" | "auto";
  timeFormat: "24h" | "12h";
  defaultMode: MapMode;
  buildings3d: boolean;
  labelScale: number;
  earthLabels: boolean;
  voice: boolean;
  volume: number;
  travelMode: TravelMode;
  avoidTolls: boolean;
  avoidHighways: boolean;
  avoidFerries: boolean;
  avoidUnpaved: boolean;
  speedTolerance: number; // km/h over limit before red
  keepScreenOn: boolean;
  autoNight: boolean;
  leftHanded: boolean;
  locationHistory: boolean;
  tripHistory: boolean;
  syncTrips: boolean;
  vehicleType: "car" | "ev" | "van" | "truck";
  evRangeKm: number;
  vehicleHeight: number;
  vehicleWeight: number;
  liveTraffic: boolean;
  trafficThickness: number;
};

export const defaultSettings: Settings = {
  units: "metric",
  theme: "auto",
  timeFormat: "24h",
  defaultMode: "standard",
  buildings3d: true,
  labelScale: 1,
  earthLabels: true,
  voice: true,
  volume: 0.9,
  travelMode: "drive",
  avoidTolls: false,
  avoidHighways: false,
  avoidFerries: false,
  avoidUnpaved: false,
  speedTolerance: 5,
  keepScreenOn: true,
  autoNight: true,
  leftHanded: false,
  locationHistory: false,
  tripHistory: false,
  syncTrips: false,
  vehicleType: "car",
  evRangeKm: 300,
  vehicleHeight: 2,
  vehicleWeight: 3.5,
  liveTraffic: false,
  trafficThickness: 1,
};

type Ctx = { settings: Settings; update: (p: Partial<Settings>) => void; applySynced: (p: Partial<Settings>) => void; dark: boolean };
const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [systemDark, setSystemDark] = useState(false);
  const current = useRef(settings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = storage.get<Partial<Settings>>("settings", {});
    const privacyChosen = storage.get("privacy-v2", false);
    current.current = { ...defaultSettings, ...stored, ...(!privacyChosen ? { locationHistory: false, tripHistory: false, syncTrips: false } : {}) };
    setSettings(current.current); setLoaded(true);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const h = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const dark = settings.theme === "dark" || (settings.theme === "auto" && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const applySynced = useCallback((p: Partial<Settings>) => {
    if (!Object.entries(p).some(([k, v]) => current.current[k as keyof Settings] !== v)) return;
    current.current = { ...current.current, ...p }; setSettings(current.current);
  }, []);
  const update = useCallback((p: Partial<Settings>) => {
    applySynced(p);
    if ("locationHistory" in p || "tripHistory" in p) storage.set("privacy-v2", true);
    window.dispatchEvent(new CustomEvent("meridian-settings-change", { detail: p }));
  }, [applySynced]);
  useEffect(() => {
    if (!loaded) return;
    const save = () => storage.set("settings", current.current);
    const timer = setTimeout(save, 200);
    window.addEventListener("pagehide", save);
    return () => { clearTimeout(timer); window.removeEventListener("pagehide", save); };
  }, [settings, loaded]);
  useEffect(() => () => storage.set("settings", current.current), []);

  const value = useMemo(() => ({ settings, update, applySynced, dark }), [settings, update, applySynced, dark]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error("useSettings outside provider");
  return c;
}

export const env = {
  mapillary: import.meta.env["VITE_MAPILLARY_TOKEN"] as string | undefined,
  tomtom: import.meta.env["VITE_TOMTOM_KEY"] as string | undefined,
  maptiler: import.meta.env["VITE_MAPTILER_KEY"] as string | undefined,
};
