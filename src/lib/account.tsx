import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "./settings";
import { readTrips, mergeTrips, clearTrips } from "./trips";
import { storage } from "./platform";

type Account = { user: User | null; ready: boolean; consentNeeded: boolean; syncStatus: string; refresh: () => Promise<void> };
const Context = createContext<Account | null>(null);
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [consentNeeded, setConsentNeeded] = useState(false);
  const [syncStatus, setSyncStatus] = useState("On device");
  const { settings, update } = useSettings();
  const busy = useRef(false);
  const activeUser = useRef<string | null>(null);
  const refresh = async () => {
    const result = await supabase.auth.getUser();
    const u = result.data.user; activeUser.current = u?.id ?? null; setUser(u); setReady(true);
    const owner = storage.get<string | null>("trip-sync-owner", null);
    if (owner && owner !== u?.id) { clearTrips(); storage.set("trip-sync-owner", null); }
    if (!u) { setConsentNeeded(false); return; }
    const { data, error } = await supabase.from("travel_preferences").select("*").eq("user_id", u.id).maybeSingle();
    if (error) { setSyncStatus("Disconnected"); setConsentNeeded(true); return; }
    setConsentNeeded(!data);
    if (data) update({ tripHistory: data.history_opt_in, syncTrips: data.sync_opt_in });
    else update({ tripHistory: false, syncTrips: false });
  };
  useEffect(() => { void refresh(); return () => {}; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let previous: string | null | undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      const id = session?.user.id ?? null;
      if (event !== "USER_UPDATED" && id === previous) return;
      previous = id; activeUser.current = id; setUser(session?.user ?? null);
      if (!session) { if (storage.get("trip-sync-owner", null)) clearTrips(); storage.set("trip-sync-owner", null); setConsentNeeded(false); setSyncStatus("On device"); update({ syncTrips: false }); }
      else setTimeout(() => { void refresh(); }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user || consentNeeded || !settings.syncTrips || !settings.tripHistory) { setSyncStatus("On device"); return; }
    let cancelled = false;
    const sync = async () => {
      if (busy.current || !navigator.onLine) { if (!navigator.onLine) setSyncStatus("Offline"); return; }
      busy.current = true; setSyncStatus("Syncing");
      try {
        const remote = await supabase.from("trip_summaries").select("*").eq("user_id", user.id);
        if (remote.error) throw remote.error;
        const known = new Set((remote.data ?? []).map(t => t.id));
        const missing = readTrips().filter(t => !known.has(t.id));
        if (missing.length) { const uploaded = await supabase.from("trip_summaries").insert(missing.map(t => ({ ...t, user_id: user.id }))); if (uploaded.error) throw uploaded.error; }
        if (!cancelled && activeUser.current === user.id) { storage.set("trip-sync-owner", user.id); mergeTrips(remote.data ?? []); setSyncStatus("Synced"); }
      } catch { if (!cancelled) setSyncStatus("Retry when online"); }
      finally { busy.current = false; }
    };
    void sync(); window.addEventListener("meridian-trips", sync); window.addEventListener("online", sync);
    const timer = window.setInterval(sync, 60000);
    const channel = supabase.channel(`trip-sync-${user.id}`).on("postgres_changes", { event: "*", schema: "public", table: "trip_summaries", filter: `user_id=eq.${user.id}` }, () => { void sync(); }).subscribe();
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("meridian-trips", sync); window.removeEventListener("online", sync); void supabase.removeChannel(channel); };
  }, [user?.id, settings.syncTrips, settings.tripHistory, consentNeeded]);
  return <Context.Provider value={{ user, ready, consentNeeded, syncStatus, refresh }}>{children}</Context.Provider>;
}
export function useAccount() { const value = useContext(Context); if (!value) throw new Error("Account provider missing"); return value; }