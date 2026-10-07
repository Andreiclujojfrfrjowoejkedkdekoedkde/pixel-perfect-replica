// Named places: the ones a driver actually leaves for (home, work, school) plus
// custom lists. Kept separate from the flat saved list so the home screen can
// offer "Take me home" without the driver digging through bookmarks.

import { useEffect, useState } from "react";
import { storage } from "./platform";
import type { Place } from "./services";

export const BUILTIN_KINDS = ["home", "work", "school"] as const;
export type BuiltinKind = (typeof BUILTIN_KINDS)[number];

export type SavedPlace = Place & {
  /** "home" | "work" | "school" | "favorite" | a user list id */
  list: string;
  updatedAt: string;
};

export type PlaceList = { id: string; label: string; builtin: boolean; order: number };

const LISTS_KEY = "place-lists";
const PLACES_KEY = "named-places";
export const FAVORITES = "favorite";

const DEFAULT_LISTS: PlaceList[] = [
  { id: "home", label: "Home", builtin: true, order: 0 },
  { id: "work", label: "Work", builtin: true, order: 1 },
  { id: "school", label: "School", builtin: true, order: 2 },
  { id: FAVORITES, label: "Favourites", builtin: true, order: 3 },
];

type State = { lists: PlaceList[]; places: SavedPlace[] };
const listeners = new Set<() => void>();
let state: State | null = null;

const now = () => new Date().toISOString();

function load(): State {
  if (!state) {
    state = {
      lists: storage.get<PlaceList[]>(LISTS_KEY, DEFAULT_LISTS),
      places: storage.get<SavedPlace[]>(PLACES_KEY, []),
    };
    // Built-in lists can be relabelled but never removed.
    const missing = DEFAULT_LISTS.filter((d) => !state!.lists.some((l) => l.id === d.id));
    if (missing.length) {
      state.lists = [...state.lists, ...missing];
      storage.set(LISTS_KEY, state.lists);
    }
  }
  return state;
}
function commit(next: State) {
  state = next;
  storage.set(LISTS_KEY, next.lists);
  storage.set(PLACES_KEY, next.places);
  listeners.forEach((l) => l());
}

export const namedPlaces = {
  all(): SavedPlace[] {
    return [...load().places].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  },
  lists(): PlaceList[] {
    return [...load().lists].sort((a, b) => a.order - b.order);
  },
  inList(list: string): SavedPlace[] {
    return namedPlaces.all().filter((p) => p.list === list);
  },
  /** Assign a place to a list, replacing whatever that list held before. */
  setSlot(list: string, place: Place | null) {
    const s = load();
    const rest = s.places.filter((p) => p.list !== list);
    commit({ ...s, places: place ? [...rest, { ...place, list, updatedAt: now() }] : rest });
  },
  toggleInList(list: string, place: Place) {
    const s = load();
    const has = s.places.some((p) => p.id === place.id && p.list === list);
    commit({
      ...s,
      places: has
        ? s.places.filter((p) => !(p.id === place.id && p.list === list))
        : [...s.places, { ...place, list, updatedAt: now() }],
    });
  },
  /** Add or remove a custom list. Built-in lists are protected. */
  addList(label: string): string {
    const s = load();
    const id = `list-${label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
    commit({ ...s, lists: [...s.lists, { id, label, builtin: false, order: s.lists.length }] });
    return id;
  },
  removeList(id: string) {
    const s = load();
    if (s.lists.some((l) => l.id === id && l.builtin)) return;
    commit({
      lists: s.lists.filter((l) => l.id !== id),
      places: s.places.filter((p) => p.list !== id),
    });
  },
  renameList(id: string, label: string) {
    commit({ ...load(), lists: load().lists.map((l) => (l.id === id ? { ...l, label } : l)) });
  },
  remove(id: string, list: string) {
    commit({ ...load(), places: load().places.filter((p) => !(p.id === id && p.list === list)) });
  },
  isIn(list: string, id: string) {
    return load().places.some((p) => p.id === id && p.list === list);
  },
};

export function useNamedPlaces(): State {
  const [v, setV] = useState<State>({ lists: [], places: [] });
  useEffect(() => {
    const f = () => setV({ lists: namedPlaces.lists(), places: namedPlaces.all() });
    f();
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return v;
}
