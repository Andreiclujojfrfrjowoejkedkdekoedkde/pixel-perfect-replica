import { useEffect, useState } from "react";
import { storage } from "./platform";
import type { Place } from "./services";

// Saved places and recents, kept on-device (cloud sync arrives with accounts).
type Lists = { saved: Place[]; recent: Place[] };
const listeners = new Set<() => void>();
let state: Lists | null = null;

function load(): Lists {
  if (!state) state = { saved: storage.get("saved", []), recent: storage.get("recent", []) };
  return state;
}
function commit(n: Lists) {
  state = n;
  storage.set("saved", n.saved);
  storage.set("recent", n.recent);
  listeners.forEach((l) => l());
}

export const library = {
  toggleSave(p: Place) {
    const s = load();
    const has = s.saved.some((x) => x.id === p.id);
    commit({ ...s, saved: has ? s.saved.filter((x) => x.id !== p.id) : [p, ...s.saved] });
  },
  addRecent(p: Place) {
    const s = load();
    commit({ ...s, recent: [p, ...s.recent.filter((x) => x.id !== p.id)].slice(0, 12) });
  },
  clearRecent() {
    commit({ ...load(), recent: [] });
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
