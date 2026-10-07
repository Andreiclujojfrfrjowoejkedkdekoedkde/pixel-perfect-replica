import { useEffect, useState } from "react";
import { storage } from "./platform";
import type { Place } from "./services";

// Saved places and recents on-device. The cloud is a mirror, never the source of
// truth: every local change is written here first, stamped, and only then pushed.
// Deletions leave a tombstone so a delete survives the round trip and reaches
// other devices instead of being resurrected by an older copy.
type Lists = { saved: Place[]; recent: Place[] };
export type ItemMeta = { updatedAt: string; syncedAt: string | null; deletedAt: string | null };

const META_KEY = "savedmeta";
const listeners = new Set<() => void>();
let state: Lists | null = null;
let meta: Record<string, ItemMeta> | null = null;

const now = () => new Date().toISOString();

function load(): Lists {
  if (!state) state = { saved: storage.get("saved", []), recent: storage.get("recent", []) };
  return state;
}
function loadMeta(): Record<string, ItemMeta> {
  if (!meta) meta = storage.get<Record<string, ItemMeta>>(META_KEY, {});
  return meta;
}
function commit(n: Lists) {
  state = n;
  storage.set("saved", n.saved);
  storage.set("recent", n.recent);
  notify();
}
function commitMeta(m: Record<string, ItemMeta>) {
  meta = m;
  storage.set(META_KEY, m);
  notify();
}
function notify() {
  listeners.forEach((l) => l());
}

/** Garbage-collect tombstones older than the retention window. */
const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000;
function prune(m: Record<string, ItemMeta>) {
  const cutoff = Date.now() - TOMBSTONE_TTL;
  return Object.fromEntries(
    Object.entries(m).filter(([, v]) => !v.deletedAt || Date.parse(v.deletedAt) > cutoff),
  );
}

export const library = {
  toggleSave(p: Place) {
    const s = load();
    const m = loadMeta();
    const has = s.saved.some((x) => x.id === p.id);
    const stamp = now();
    if (has) {
      commit({ ...s, saved: s.saved.filter((x) => x.id !== p.id) });
      commitMeta({
        ...prune(m),
        [p.id]: { updatedAt: stamp, syncedAt: m[p.id]?.syncedAt ?? null, deletedAt: stamp },
      });
    } else {
      commit({ ...s, saved: [p, ...s.saved] });
      commitMeta({ ...prune(m), [p.id]: { updatedAt: stamp, syncedAt: null, deletedAt: null } });
    }
  },
  isSaved(id: string) {
    return load().saved.some((x) => x.id === id);
  },
  addRecent(p: Place) {
    const s = load();
    commit({ ...s, recent: [p, ...s.recent.filter((x) => x.id !== p.id)].slice(0, 12) });
  },
  clearRecent() {
    commit({ ...load(), recent: [] });
  },
  /** Items whose local stamp differs from what the server last confirmed. */
  pending(): { id: string; meta: ItemMeta; place: Place | null }[] {
    const s = load();
    const m = loadMeta();
    const out: { id: string; meta: ItemMeta; place: Place | null }[] = [];
    for (const [id, v] of Object.entries(m)) {
      if (v.updatedAt === v.syncedAt) continue;
      out.push({ id, meta: v, place: s.saved.find((x) => x.id === id) ?? null });
    }
    return out;
  },
  /**
   * Merge one server row. Last write wins on updated_at; a tombstone from the
   * server removes the local copy and is kept so we do not push it back.
   */
  applyRemote(row: {
    id: string;
    place: Place | null;
    updatedAt: string;
    deletedAt: string | null;
  }) {
    const s = load();
    const m = loadMeta();
    const mine = m[row.id];
    if (mine && mine.updatedAt >= row.updatedAt) return false; // local is newer or identical
    if (row.deletedAt) {
      commit({ ...s, saved: s.saved.filter((x) => x.id !== row.id) });
    } else if (row.place) {
      const exists = s.saved.some((x) => x.id === row.id);
      commit({
        ...s,
        saved: exists
          ? s.saved.map((x) => (x.id === row.id ? row.place! : x))
          : [row.place, ...s.saved],
      });
    }
    commitMeta({
      ...m,
      [row.id]: { updatedAt: row.updatedAt, syncedAt: row.updatedAt, deletedAt: row.deletedAt },
    });
    return true;
  },
  /** Record that the server now holds this item, so it stops being pending. */
  markSynced(ids: string[]) {
    const m = loadMeta();
    let changed = false;
    for (const id of ids) {
      const item = m[id];
      // syncedAt tracks updated_at, which is what pending() compares against.
      if (item && item.syncedAt !== item.updatedAt) {
        m[id] = { ...item, syncedAt: item.updatedAt };
        changed = true;
      }
    }
    if (changed) commitMeta(m);
  },
  /** Drop everything on-device. Only used when the local data belongs to another account. */
  clearAll() {
    commit({ saved: [], recent: [] });
    commitMeta({});
  },
  resetForUser() {
    state = null;
    meta = null;
    notify();
  },
};

export function useLibrary(): Lists {
  const [v, setV] = useState<Lists>({ saved: [], recent: [] });
  useEffect(() => {
    const f = () => setV({ ...load() });
    f();
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return v;
}
