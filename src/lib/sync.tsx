import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import { library } from "./library";
import { storage } from "./platform";
import { defaultSettings, type Settings, type SettingsMeta } from "./settings";
import type { Place } from "./services";

export type SyncStatus = "local" | "syncing" | "synced" | "error";
export type SyncState = {
  status: SyncStatus;
  lastSyncedAt: string | null;
  pendingCount: number;
  error: string | null;
  syncNow: () => void;
};

const EMPTY: SyncState = {
  status: "local",
  lastSyncedAt: null,
  pendingCount: 0,
  error: null,
  syncNow: () => {},
};
const Ctx = createContext<SyncState>(EMPTY);

const META_KEY = "syncmeta";
/**
 * `userId` is who is signed in now; `ownerId` is whose data is on this device.
 * They differ after a sign-out, which is what lets a later sign-in tell a first
 * merge on this device apart from switching to somebody else's account.
 */
type SyncMeta = { userId: string | null; lastSyncedAt: string | null; ownerId: string | null };
const readMeta = (): SyncMeta =>
  storage.get<SyncMeta>(META_KEY, { userId: null, lastSyncedAt: null, ownerId: null });
const writeMeta = (m: SyncMeta) => storage.set(META_KEY, m);

const settingsMeta = () =>
  storage.get<SettingsMeta>("settingsmeta", { updatedAt: "", syncedAt: null });
const writeSettingsMeta = (m: SettingsMeta) => storage.set("settingsmeta", m);

type SavedRow = {
  id: string;
  name: string;
  subtitle: string;
  kind: string;
  lon: number;
  lat: number;
  updated_at: string;
  deleted_at: string | null;
};

const rowToPlace = (r: SavedRow): Place => ({
  id: r.id,
  name: r.name,
  subtitle: r.subtitle,
  kind: r.kind,
  lon: r.lon,
  lat: r.lat,
});

/** Apply a settings object the server sent, only if it is newer than ours. */
function applyRemoteSettings(data: unknown, updatedAt: string) {
  if (!data || typeof data !== "object") return false;
  const mine = settingsMeta();
  if (mine.updatedAt >= updatedAt) return false;
  storage.set("settings", { ...defaultSettings, ...(data as Partial<Settings>) });
  writeSettingsMeta({ updatedAt, syncedAt: updatedAt });
  return true;
}

/**
 * Two-way sync for signed-in users. Local storage always wins on a tie, the
 * newest updated_at wins otherwise, and deletions travel as tombstones so they
 * reach other devices. Realtime keeps a second device current without polling.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth();
  const [state, setState] = useState<SyncState>({ ...EMPTY, status: "local" });
  const running = useRef(false);
  const userId = user?.id ?? null;

  const syncNow = useCallback(async () => {
    if (!userId || running.current || !navigator.onLine) return;
    running.current = true;
    setState((s) => ({ ...s, status: "syncing", error: null }));
    try {
      // First sign-in on this device merges whatever was here into the account.
      // Signing into a different account does not: that data is the previous
      // person's, and pushing it would hand it to the new account.
      const previousOwner = readMeta().ownerId;
      const switching = previousOwner != null && previousOwner !== userId;
      if (switching) {
        library.clearAll();
        writeSettingsMeta({ updatedAt: "", syncedAt: null });
        storage.set("settings", defaultSettings);
        window.dispatchEvent(new CustomEvent("meridian:settings-remote"));
      }

      const pending = switching ? [] : library.pending();
      if (pending.length) {
        const { error } = await supabase.from("saved_places").upsert(
          pending.map((p) => ({
            id: p.id,
            user_id: userId,
            name: p.place?.name ?? "",
            subtitle: p.place?.subtitle ?? "",
            kind: p.place?.kind ?? "Place",
            lon: p.place?.lon ?? 0,
            lat: p.place?.lat ?? 0,
            updated_at: p.meta.updatedAt,
            // A tombstone keeps the row so the delete reaches other devices.
            deleted_at: p.meta.deletedAt,
          })),
        );
        if (error) throw error;
        library.markSynced(pending.map((p) => p.id));
      }

      const { data: savedRows, error: savedErr } = await supabase
        .from("saved_places")
        .select("id,name,subtitle,kind,lon,lat,updated_at,deleted_at");
      if (savedErr) throw savedErr;
      for (const row of (savedRows ?? []) as SavedRow[]) {
        library.applyRemote({
          id: row.id,
          place: row.deleted_at ? null : rowToPlace(row),
          updatedAt: row.updated_at,
          deletedAt: row.deleted_at,
        });
      }

      const { data: settingsRow, error: settingsErr } = await supabase
        .from("user_settings")
        .select("data,updated_at")
        .maybeSingle();
      if (settingsErr) throw settingsErr;

      const mine = settingsMeta();
      if (!mine.updatedAt) {
        // Nothing local to compare against: take the server copy when it exists.
        if (settingsRow) applyRemoteSettings(settingsRow.data, settingsRow.updated_at);
      } else if (mine.updatedAt > (settingsRow?.updated_at ?? "")) {
        const { error: pushErr } = await supabase.from("user_settings").upsert({
          user_id: userId,
          data: storage.get<Settings>("settings", defaultSettings),
          updated_at: mine.updatedAt,
        });
        if (pushErr) throw pushErr;
        writeSettingsMeta({ ...mine, syncedAt: mine.updatedAt });
      } else if (settingsRow) {
        applyRemoteSettings(settingsRow.data, settingsRow.updated_at);
      }

      const at = new Date().toISOString();
      writeMeta({ userId, lastSyncedAt: at, ownerId: userId });
      setState((s) => ({
        ...s,
        status: "synced",
        lastSyncedAt: at,
        pendingCount: library.pending().length,
        error: null,
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Sync failed.";
      // Never surface a raw PostgREST/SQL error to the UI.
      setState((s) => ({
        ...s,
        status: "error",
        error: "Could not sync just now. Your changes are safe on this device.",
      }));
      console.warn("[sync]", message);
    } finally {
      running.current = false;
    }
  }, [userId]);

  // Sync on sign-in, on reconnect and on a slow timer once signed in.
  useEffect(() => {
    if (authStatus !== "signed-in" || !userId) {
      // Keep ownerId: it records whose data is on this device, not who is here.
      const m = readMeta();
      writeMeta({ ...m, userId: null, lastSyncedAt: null });
      setState({ ...EMPTY, status: "local" });
      return;
    }
    // Make sure the in-memory copies are loaded from storage for this account.
    library.resetForUser();
    void syncNow();
    const onOnline = () => void syncNow();
    addEventListener("online", onOnline);
    const timer = setInterval(() => void syncNow(), 120_000);
    return () => {
      removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [authStatus, userId, syncNow]);

  // Local edits mark work as pending straight away.
  useEffect(() => {
    if (authStatus !== "signed-in") return;
    const bump = () =>
      setState((s) => ({
        ...s,
        pendingCount: library.pending().length,
        status: s.status === "synced" ? "syncing" : s.status,
      }));
    const timer = setInterval(bump, 3000);
    bump();
    return () => clearInterval(timer);
  }, [authStatus]);

  // Realtime: a second device sees changes without waiting for the next poll.
  useEffect(() => {
    if (authStatus !== "signed-in" || !userId) return;
    const channel: RealtimeChannel = supabase
      .channel(`meridian-sync-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "saved_places" },
        (payload) => {
          const row = (
            payload.eventType === "DELETE" ? payload.old : payload.new
          ) as Partial<SavedRow> | null;
          if (!row?.id || !row.updated_at) return;
          library.applyRemote({
            id: row.id,
            place: row.deleted_at ? null : rowToPlace(row as SavedRow),
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at ?? null,
          });
          setState((s) => ({ ...s, pendingCount: library.pending().length }));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_settings" },
        (payload) => {
          const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as {
            data?: unknown;
            updated_at?: string;
          } | null;
          if (!row?.updated_at) return;
          if (applyRemoteSettings(row.data, row.updated_at)) {
            window.dispatchEvent(new CustomEvent("meridian:settings-remote"));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authStatus, userId]);

  const value = useMemo<SyncState>(
    () => ({ ...state, syncNow: () => void syncNow() }),
    [state, syncNow],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync() {
  return useContext(Ctx);
}
