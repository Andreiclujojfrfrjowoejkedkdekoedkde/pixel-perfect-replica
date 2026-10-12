import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { defaultSettings, useSettings, type Settings } from "./settings";
import { storage } from "./platform";

const excluded = new Set(["locationHistory", "tripHistory", "syncTrips"]);
export function syncablePreferences(value: unknown): Partial<Settings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clean: Record<string, unknown> = {};
  const enums: Record<string, string[]> = { units: ["metric", "imperial"], theme: ["light", "dark", "auto"], timeFormat: ["24h", "12h"], defaultMode: ["standard", "3d", "earth", "street"], travelMode: ["drive", "walk", "cycle"], vehicleType: ["car", "ev", "van", "truck"] };
  const ranges: Record<string, number[]> = { labelScale: [0.8, 1.4], volume: [0, 1], speedTolerance: [0, 30], evRangeKm: [50, 1000], vehicleHeight: [1, 6], vehicleWeight: [0.5, 80], trafficThickness: [0.5, 2] };
  for (const [key, v] of Object.entries(value)) {
    const d = defaultSettings[key as keyof Settings];
    if (excluded.has(key) || d === undefined || typeof v !== typeof d) continue;
    if (typeof v === "string" && !enums[key]?.includes(v)) continue;
    const range = ranges[key];
    if (typeof v === "number" && (!Number.isFinite(v) || (range && (v < (range[0] ?? -Infinity) || v > (range[1] ?? Infinity))))) continue;
    clean[key] = v;
  }
  return clean as Partial<Settings>;
}
type SyncState = { enabled: boolean; status: string; setEnabled: (enabled: boolean) => Promise<void> };
const Context = createContext<SyncState | null>(null);
export function PreferenceSyncProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const { settings, applySynced } = useSettings();
  const current = useRef(settings); current.current = settings;
  const [enabled, setOn] = useState(false);
  const [status, setStatus] = useState("On device");
  const active = useRef<{ id: string; on: boolean; pending: Partial<Settings>; flush: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (!userId) { active.current = null; setOn(false); setStatus("On device"); return; }
    const key = `preference-sync:${userId}`;
    const stored = storage.get<{ on: boolean; pending: Partial<Settings> }>(key, { on: false, pending: {} });
    let cancelled = false; let busy = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const state = { id: userId, on: stored.on, pending: syncablePreferences(stored.pending), flush: async () => {} };
    active.current = state; setOn(state.on);
    const persist = () => storage.set(key, { on: state.on, pending: state.pending });
    const read = async () => {
      if (busy || cancelled) return;
      if (!navigator.onLine) { setStatus(state.on ? "Waiting for connection" : "On device"); return; }
      busy = true;
      try {
        const result = await supabase.from("account_settings").select("enabled,preferences").eq("user_id", userId).maybeSingle();
        if (result.error) throw result.error;
        if (cancelled) return;
        state.on = result.data?.enabled ?? false; setOn(state.on);
        if (state.on) {
          applySynced({ ...syncablePreferences(result.data?.preferences), ...state.pending });
          if (Object.keys(state.pending).length) {
            const sending = state.pending; state.pending = {}; persist();
            const sent = await supabase.rpc("patch_account_settings", { p_patch: sending });
            if (sent.error) { state.pending = { ...sending, ...state.pending }; throw sent.error; }
          }
        } else state.pending = {};
        persist(); setStatus(state.on ? "Synced" : "On device");
      } catch { if (!cancelled) { persist(); setStatus("Retry when online"); } }
      finally { busy = false; }
    };
    state.flush = read;
    const changed = (event: Event) => {
      if (!state.on) return;
      state.pending = { ...state.pending, ...syncablePreferences((event as CustomEvent).detail) }; persist(); setStatus("Syncing…");
      clearTimeout(timer); timer = setTimeout(() => void read(), 700);
    };
    const online = () => void read();
    window.addEventListener("meridian-settings-change", changed); window.addEventListener("online", online);
    const channel = supabase.channel(`preferences:${userId}`).on("postgres_changes", { event: "*", schema: "public", table: "account_settings", filter: `user_id=eq.${userId}` }, online).subscribe();
    const interval = setInterval(online, 60000); void read();
    return () => { cancelled = true; clearTimeout(timer); clearInterval(interval); persist(); window.removeEventListener("meridian-settings-change", changed); window.removeEventListener("online", online); void supabase.removeChannel(channel); if (active.current === state) active.current = null; };
  }, [userId, applySynced]);
  const setEnabled = async (on: boolean) => {
    const state = active.current; if (!state) return;
    setStatus("Saving…");
    const result = await supabase.rpc("patch_account_settings", { p_patch: on ? syncablePreferences(current.current) : {}, p_enabled: on });
    if (active.current !== state) return;
    if (result.error) { setStatus("Could not save. Retry while connected."); return; }
    state.on = on; state.pending = {}; storage.set(`preference-sync:${state.id}`, { on, pending: {} }); setOn(on); setStatus(on ? "Synced" : "On device");
  };
  return <Context.Provider value={{ enabled, status, setEnabled }}>{children}</Context.Provider>;
}
export function usePreferenceSync() { const state = useContext(Context); if (!state) throw new Error("Preference sync provider missing"); return state; }