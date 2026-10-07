import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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
  postedLimits: boolean; // show OSM maxspeed signs along the route
  keepScreenOn: boolean;
  autoNight: boolean;
  leftHanded: boolean;
  locationHistory: boolean;
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
  postedLimits: true,
  keepScreenOn: true,
  autoNight: true,
  leftHanded: false,
  locationHistory: true,
};

type Ctx = { settings: Settings; update: (p: Partial<Settings>) => void; dark: boolean };
const SettingsCtx = createContext<Ctx | null>(null);

export type SettingsMeta = { updatedAt: string; syncedAt: string | null };
const SETTINGS_META = "settingsmeta";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setSettings({ ...defaultSettings, ...storage.get<Partial<Settings>>("settings", {}) });
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

  // Another device changed settings: adopt the synced copy without clobbering it.
  useEffect(() => {
    const onRemote = () =>
      setSettings({ ...defaultSettings, ...storage.get<Partial<Settings>>("settings", {}) });
    addEventListener("meridian:settings-remote", onRemote);
    return () => removeEventListener("meridian:settings-remote", onRemote);
  }, []);

  const update = (p: Partial<Settings>) =>
    setSettings((s) => {
      const n = { ...s, ...p };
      storage.set("settings", n);
      // Stamp the change so the sync engine knows this device is ahead.
      storage.set(SETTINGS_META, {
        updatedAt: new Date().toISOString(),
        syncedAt: storage.get<SettingsMeta>(SETTINGS_META, { updatedAt: "", syncedAt: null })
          .syncedAt,
      });
      return n;
    });

  return <SettingsCtx.Provider value={{ settings, update, dark }}>{children}</SettingsCtx.Provider>;
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
