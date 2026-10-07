// Routes that survive losing the network.
//
// A real graph-based offline router needs an OSRM/GraphHopper WASM build plus
// regional PBF extracts, tens of megabytes per region and its own data
// pipeline. That is not something to smuggle into a web bundle, so instead we
// do the part that is genuinely useful offline: remember routes we already know
// and replay them. A journey you have taken once keeps working in a tunnel, on
// a ferry or in a dead spot, which is when navigation actually needs it.
//
// Nothing here invents a route. If a route is not in the store and there is no
// connection, the caller is told so plainly instead of being given a guess.

import { useEffect, useState } from "react";
import { storage } from "./platform";
import type { Route } from "./services";

export type StoredRoute = {
  /** Stable key: origin, destination and travel mode, rounded. */
  key: string;
  route: Route;
  mode: string;
  originLabel: string;
  destinationLabel: string;
  createdAt: string;
  drivenAt?: string;
  timesDriven: number;
};

const KEY = "stored-routes";
const KEEP = 60;
const listeners = new Set<() => void>();
let cache: StoredRoute[] | null = null;

const load = () => {
  if (!cache) cache = storage.get<StoredRoute[]>(KEY, []);
  return cache;
};
const commit = (next: StoredRoute[]) => {
  cache = next;
  storage.set(KEY, next);
  listeners.forEach(() => {});
};

const round = (n: number) => n.toFixed(3);

export function routeKey(from: [number, number], to: [number, number], mode: string): string {
  return `${round(from[1])},${round(from[0])}->${round(to[1])},${round(to[0])}:${mode}`;
}

export const storedRoutes = {
  all(): StoredRoute[] {
    // Most-driven first, then most recent. Sorting by timesDriven before
    // timestamp also keeps the order stable when two routes are saved within
    // the same millisecond, which a timestamp-only sort does not.
    return [...load()].sort((a, b) => {
      if (a.timesDriven !== b.timesDriven) return b.timesDriven - a.timesDriven;
      const at = a.drivenAt ?? a.createdAt;
      const bt = b.drivenAt ?? b.createdAt;
      if (at !== bt) return bt.localeCompare(at);
      return a.key.localeCompare(b.key);
    });
  },

  get(key: string): StoredRoute | null {
    return load().find((r) => r.key === key) ?? null;
  },

  /** Any route we already know between these two points, ignoring direction. */
  find(from: [number, number], to: [number, number], mode: string): StoredRoute | null {
    const exact = routeKey(from, to, mode);
    const reverse = routeKey(to, from, mode);
    return load().find((r) => r.key === exact || r.key === reverse) ?? null;
  },

  put(entry: Omit<StoredRoute, "timesDriven" | "createdAt"> & { createdAt?: string }): void {
    const existing = load().find((r) => r.key === entry.key);
    const next: StoredRoute = {
      ...entry,
      createdAt: existing?.createdAt ?? entry.createdAt ?? new Date().toISOString(),
      timesDriven: existing?.timesDriven ?? 0,
    };
    commit([next, ...load().filter((r) => r.key !== entry.key)].slice(0, KEEP));
  },

  /** Record that we actually drove this one, so frequent routes float up. */
  markDriven(key: string) {
    const hit = load().find((r) => r.key === key);
    if (!hit) return;
    commit(
      load().map((r) =>
        r.key === key
          ? { ...r, timesDriven: r.timesDriven + 1, drivenAt: new Date().toISOString() }
          : r,
      ),
    );
  },

  remove(key: string) {
    commit(load().filter((r) => r.key !== key));
  },

  clear() {
    commit([]);
  },
};

export function useStoredRoutes(): StoredRoute[] {
  const [v, setV] = useState<StoredRoute[]>(() => storedRoutes.all());
  useEffect(() => {
    const f = () => setV(storedRoutes.all());
    f();
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return v;
}
