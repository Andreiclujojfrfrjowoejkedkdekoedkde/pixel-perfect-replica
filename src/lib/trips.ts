import { useEffect, useState } from "react";
import { storage } from "./platform";

// A short local log of journeys, so "where did I go last Tuesday" has an answer
// and so the home screen can show a habit. Stays on the device by default.

export type Trip = {
  id: string;
  startedAt: string;
  endedAt: string;
  distance: number; // metres
  duration: number; // seconds
  fromLabel: string;
  toLabel: string;
  mode: string;
};

const KEY = "trips";
const KEEP = 200;
const listeners = new Set<() => void>();
let cache: Trip[] | null = null;

const load = () => {
  if (!cache) cache = storage.get<Trip[]>(KEY, []);
  return cache;
};
const commit = (next: Trip[]) => {
  cache = next;
  storage.set(KEY, next);
  listeners.forEach((l) => l());
};

export const trips = {
  all(): Trip[] {
    return [...load()].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  },
  /** Record a finished journey. Ignores trivial hops so the list stays useful. */
  record(t: Omit<Trip, "id">) {
    if (t.distance < 500 || t.duration < 60) return;
    const entry: Trip = { ...t, id: `${Date.now().toString(36)}` };
    commit([entry, ...load()].slice(0, KEEP));
  },
  remove(id: string) {
    commit(load().filter((t) => t.id !== id));
  },
  clear() {
    commit([]);
  },
  stats() {
    const all = load();
    return {
      count: all.length,
      distance: all.reduce((s, t) => s + t.distance, 0),
      duration: all.reduce((s, t) => s + t.duration, 0),
    };
  },
};

export function useTrips(): Trip[] {
  const [v, setV] = useState<Trip[]>([]);
  useEffect(() => {
    const f = () => setV(trips.all());
    f();
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return v;
}

export const clearTrips = () => trips.clear();
