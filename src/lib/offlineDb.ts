// IndexedDB for downloaded areas and their offline search index. Wrapped by hand
// so the app keeps its promise of very few dependencies and works offline itself.

export type BBox = [number, number, number, number]; // west, south, east, north

export type OfflineArea = {
  id: string;
  name: string;
  kind: "search" | "drawn";
  bbox: BBox;
  /** For drawn areas: the corners the user placed, clockwise. */
  polygon?: [number, number][];
  minZoom: number;
  maxZoom: number;
  tiles: number;
  bytes: number;
  done: number;
  state: "downloading" | "paused" | "ready" | "error";
  /** Places in the offline search index for this area. */
  placeCount: number;
  cacheName: string;
  date: string;
  error?: string;
};

export type OfflinePlace = {
  id: string;
  areaId: string;
  name: string;
  subtitle: string;
  kind: string;
  lon: number;
  lat: number;
  /** Lower-cased haystack for the client-side matcher. */
  s: string;
};

const DB_NAME = "meridian-offline";
const DB_VERSION = 1;
const AREAS = "areas";
const PLACES = "places";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(new Error("IndexedDB is not available here."));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AREAS)) db.createObjectStore(AREAS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PLACES)) {
        const store = db.createObjectStore(PLACES, { keyPath: "id" });
        store.createIndex("areaId", "areaId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open offline storage."));
  });
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Offline storage request failed."));
      }),
  );
}

export const offlineDb = {
  listAreas: () =>
    run<OfflineArea[]>(AREAS, "readonly", (s) => s.getAll() as IDBRequest<OfflineArea[]>),
  putArea: (a: OfflineArea) => run(AREAS, "readwrite", (s) => s.put(a) as IDBRequest<IDBValidKey>),
  getArea: (id: string) =>
    run<OfflineArea | undefined>(
      AREAS,
      "readonly",
      (s) => s.get(id) as IDBRequest<OfflineArea | undefined>,
    ),
  deleteArea: async (id: string) => {
    await run(AREAS, "readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
    // Must go through the index: the primary key is the place id, not the area,
    // so deleting by key range on the store itself silently removes nothing.
    // No IDBIndex.delete in the DOM typings, so walk the cursor instead.
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PLACES, "readwrite");
      const req = tx.objectStore(PLACES).index("areaId").openKeyCursor(IDBKeyRange.only(id));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        tx.objectStore(PLACES).delete(cursor.primaryKey);
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not clear the offline index."));
      tx.onabort = () => reject(tx.error ?? new Error("Could not clear the offline index."));
    });
  },
  putPlaces: async (places: OfflinePlace[]) => {
    if (!places.length) return;
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PLACES, "readwrite");
      const store = tx.objectStore(PLACES);
      for (const p of places) store.put(p);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Could not write the offline index."));
      tx.onabort = () => reject(tx.error ?? new Error("Could not write the offline index."));
    });
  },
  placesForArea: async (areaId: string) => {
    const db = await open();
    return new Promise<OfflinePlace[]>((resolve, reject) => {
      const tx = db.transaction(PLACES, "readonly");
      const req = tx.objectStore(PLACES).index("areaId").getAll(areaId);
      req.onsuccess = () => resolve(req.result as OfflinePlace[]);
      req.onerror = () => reject(req.error ?? new Error("Could not read the offline index."));
    });
  },
  /** Smallest set of ready areas covering a viewport, nearest first. */
  areasForBounds: async (bbox: BBox) => {
    const all = await offlineDb.listAreas();
    return all
      .filter((a) => a.state === "ready" && covers(a, bbox))
      .sort((a, b) => areaOf(b.bbox) - areaOf(a.bbox));
  },
};

/** Does an area cover this viewport (fully or mostly)? */
export function covers(area: OfflineArea, bbox: BBox) {
  const [w, s, e, n] = area.bbox;
  const overlapW = Math.min(e, bbox[2]) - Math.max(w, bbox[0]);
  const overlapH = Math.min(n, bbox[3]) - Math.max(s, bbox[1]);
  if (overlapW <= 0 || overlapH <= 0) return false;
  return overlapW >= (bbox[2] - bbox[0]) * 0.8 && overlapH >= (bbox[3] - bbox[1]) * 0.8;
}

/** Rough ground area of a bbox in km², from a local equirectangular approximation. */
export function areaOf(bbox: BBox) {
  const KM_PER_DEG = (Math.PI / 180) * 6371;
  const latMid = ((bbox[1] + bbox[3]) / 2) * (Math.PI / 180);
  const w = (bbox[2] - bbox[0]) * KM_PER_DEG * Math.cos(latMid);
  const h = (bbox[3] - bbox[1]) * KM_PER_DEG;
  return Math.abs(w * h);
}

export const cacheNameFor = (id: string) => `meridian-area-${id}`;
