import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  AlertTriangle,
  Download,
  HardDriveDownload,
  Pencil,
  Pause,
  PencilRuler,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { AreaDrawer, shapeToBBox, type DrawShape } from "@/components/map/AreaDrawer";
import { geocodeArea, setSearchBias, type GeocodeResult } from "@/lib/services";
import { network } from "@/lib/platform";
import {
  cacheNameFor,
  offlineDb,
  type BBox,
  type OfflineArea,
  type OfflinePlace,
} from "@/lib/offlineDb";
import {
  AreaDownloader,
  buildSearchIndex,
  estimate,
  fmtBytes,
  MAX_ZOOM,
  styleUrls,
  tileUrls,
  tilesFor,
  PLANET_URL,
  type Estimate,
} from "@/lib/offlineTiles";

export const Route = createFileRoute("/_map/offline")({
  validateSearch: z.object({ lat: z.number().optional(), lon: z.number().optional() }),
  head: () => ({
    meta: [
      { title: "Offline maps — Meridian" },
      { name: "description", content: "Download map areas and search them without a connection." },
      { property: "og:title", content: "Offline maps on Meridian" },
      { property: "og:description", content: "Save map areas for travel without signal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Offline,
});

const LEVELS = [
  { z: 10, label: "Overview" },
  { z: 12, label: "Town" },
  { z: 14, label: "City" },
  { z: MAX_ZOOM, label: "Full detail" },
] as const;

type Mode = { kind: "none" | "search" | "rect" | "poly" };

export function Offline() {
  const navigate = useNavigate();
  const { map } = useMapState();
  const [areas, setAreas] = useState<OfflineArea[]>([]);
  const [level, setLevel] = useState(2);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "none" });
  const [shape, setShape] = useState<DrawShape>({ kind: "none" });
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeResult[]>([]);
  const [selected, setSelected] = useState<GeocodeResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const downloader = useRef(new AreaDownloader());
  const drawn = useRef<DrawShape>({ kind: "none" });
  drawn.current = shape;

  const refresh = useCallback(
    async () =>
      setAreas(
        (await offlineDb.listAreas().catch(() => [])).sort((a, b) => b.date.localeCompare(a.date)),
      ),
    [],
  );
  const persist = useCallback(async (a: OfflineArea) => {
    await offlineDb.putArea(a);
    setAreas((prev) => [a, ...prev.filter((x) => x.id !== a.id)]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    // Progress arrives through the downloader, which owns the only writer.
    return downloader.current.subscribe((_progress, area) => {
      setRunning(true);
      void persist(area).finally(() => setRunning(false));
    });
  }, [persist]);

  // Draw mode: the first map click drops the rectangle, then the handles do the rest.
  useEffect(() => {
    if (!map || mode.kind !== "rect" || shape.kind !== "none") return;
    const onClick = (e: { lngLat: { lng: number; lat: number } }) => {
      const { lng, lat } = e.lngLat;
      const d = 0.02;
      setShape({ kind: "rect", west: lng - d, south: lat - d, east: lng + d, north: lat + d });
    };
    map.on("click", onClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [map, mode.kind, shape.kind]);

  // Keep area searches biased to what the driver is looking at.
  useEffect(() => {
    if (!map) return;
    const f = () => {
      const b = map.getBounds();
      setSearchBias([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    f();
    map.on("moveend", f);
    return () => {
      map.off("moveend", f);
    };
  }, [map]);

  useEffect(() => {
    if (!query.trim() || !network.online()) {
      setHits([]);
      return;
    }
    const ac = new AbortController();
    setSearching(true);
    const t = setTimeout(() => {
      geocodeArea(query, ac.signal)
        .then((r) => {
          setHits(r);
          setError(null);
        })
        .catch((e: Error) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => setSearching(false));
    }, 220);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [query]);

  const bbox = useMemo<BBox | null>(() => {
    if (shape.kind !== "none") return shapeToBBox(shape);
    if (mode.kind !== "search") return null;
    const pick = selected ?? hits[0];
    if (!pick) return null;
    // Prefer the geocoder's own boundary; fall back to a box around the point.
    return pick.bbox ?? [pick.lon - 0.08, pick.lat - 0.05, pick.lon + 0.08, pick.lat + 0.05];
  }, [shape, mode, hits, selected]);

  const est: Estimate | null = useMemo(
    () =>
      bbox
        ? estimate(bbox, LEVELS[level]!.z, shape.kind === "poly" ? shape.points : undefined)
        : null,
    [bbox, level, shape],
  );

  const used = areas.reduce((s, a) => s + a.bytes, 0);
  const canStart = !!bbox && !!est && !est.tooBig && !est.tooWide && !running && !busy;

  const start = async () => {
    if (!bbox || !est) return;
    if (!network.online()) {
      setError("Downloads need a connection. Already downloaded areas still work offline.");
      return;
    }
    setError(null);
    setBusy("tiles");
    try {
      const template = await tileTemplate();
      const tiles = tilesFor(
        bbox,
        0,
        LEVELS[level]!.z,
        shape.kind === "poly" ? shape.points : undefined,
      );
      const id = `${Date.now().toString(36)}`;
      const area: OfflineArea = {
        id,
        name: name.trim() || selected?.name || hits[0]?.name || describe(bbox),
        kind: shape.kind === "none" ? "search" : "drawn",
        bbox,
        ...(shape.kind === "poly" ? { polygon: shape.points } : {}),
        minZoom: 0,
        maxZoom: LEVELS[level]!.z,
        tiles: tiles.length,
        bytes: 0,
        done: 0,
        state: "downloading",
        placeCount: 0,
        cacheName: cacheNameFor(id),
        date: new Date().toISOString(),
      };
      await offlineDb.putArea(area);
      setAreas((prev) => [area, ...prev]);
      await downloader.current.start(area, [...tileUrls(tiles, template), ...styleUrls()], persist);

      // Build the offline search index once the tiles are in place.
      setBusy("index");
      const indexed: OfflinePlace[] = await buildSearchIndex(area).catch(() => []);
      if (indexed.length) await offlineDb.putPlaces(indexed);
      await persist({ ...area, state: "ready", placeCount: indexed.length });
      setShape({ kind: "none" });
      setMode({ kind: "none" });
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download could not start.");
    } finally {
      setBusy(null);
    }
  };

  const cancel = () => {
    void downloader.current.stop();
  };
  const pause = () => downloader.current.pause();
  const resume = () => downloader.current.resume();

  const remove = async (a: OfflineArea) => {
    await downloader.current.drop(a);
    await offlineDb.deleteArea(a.id);
    setAreas((prev) => prev.filter((x) => x.id !== a.id));
  };

  const refreshArea = async (a: OfflineArea) => {
    setBusy(a.id);
    try {
      const template = await tileTemplate();
      const tiles = tilesFor(a.bbox, a.minZoom, a.maxZoom, a.polygon);
      await persist({ ...a, state: "downloading", done: 0, bytes: 0 });
      await downloader.current.start(
        { ...a, state: "downloading", done: 0, bytes: 0 },
        [...tileUrls(tiles, template), ...styleUrls()],
        persist,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh this area.");
    } finally {
      setBusy(null);
    }
  };

  const fit = (a: OfflineArea) =>
    map?.fitBounds(
      [
        [a.bbox[0], a.bbox[1]],
        [a.bbox[2], a.bbox[3]],
      ],
      { padding: 60, duration: 600 },
    );

  return (
    <div className="pb-8">
      <header className="flex items-center justify-between px-5 pt-5">
        <h1 className="font-display text-2xl">Offline maps</h1>
        <button
          onClick={() => navigate({ to: "/" })}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          <X strokeWidth={1.5} />
        </button>
      </header>

      {/* -------- choose an area -------- */}
      <section className="px-5 pt-5">
        <div className="flex gap-1" role="radiogroup" aria-label="How to choose the area">
          {(
            [
              ["search", "Search a place"],
              ["rect", "Draw a rectangle"],
              ["poly", "Draw a shape"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={mode.kind === id}
              onClick={() => {
                setMode((m) => (m.kind === id ? { kind: "none" } : { kind: id }));
                setShape({ kind: "none" });
              }}
              className={`flex-1 rounded-lg py-2 text-sm ${mode.kind === id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode.kind === "search" && (
          <div className="relative mt-3">
            <div className="flex h-10 items-center gap-2 rounded-lg border bg-background px-3">
              <Search strokeWidth={1.5} className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                }}
                placeholder="City or country"
                aria-label="Search for a city or country to download"
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            {hits.length > 0 && (
              <ul className="surface absolute left-0 right-0 top-11 z-50 max-h-56 overflow-y-auto rounded-lg border py-1 shadow-lg">
                {hits.map((h) => (
                  <li key={h.id}>
                    <button
                      onClick={() => {
                        // Keep the chosen result as the download target; typing
                        // again clears it so the new results are used instead.
                        setSelected(h);
                        setQuery(h.name);
                        setName(h.name);
                        map?.flyTo({ center: [h.lon, h.lat], zoom: h.bbox ? zoomFor(h.bbox) : 10 });
                      }}
                      aria-pressed={(selected ?? hits[0])?.id === h.id}
                      className={`w-full px-3 py-2 text-left ${(selected ?? hits[0])?.id === h.id ? "bg-secondary" : "hover:bg-secondary/60"}`}
                    >
                      <span className="block truncate text-sm">{h.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {h.subtitle}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {searching && <p className="mt-1 text-xs text-muted-foreground">Searching…</p>}
          </div>
        )}

        {mode.kind === "rect" && shape.kind === "none" && (
          <p className="mt-3 text-sm text-muted-foreground">
            Tap the map to drop the rectangle, then drag its corners.
          </p>
        )}
        {mode.kind === "poly" && (
          <p className="mt-3 text-sm text-muted-foreground">
            Tap to add points ({shape.kind === "poly" ? shape.points.length : 0} so far, 3 minimum).
            Drag a point to adjust it.
          </p>
        )}
        {(mode.kind === "rect" || mode.kind === "poly") && (
          <button
            onClick={() => {
              setShape({ kind: "none" });
            }}
            className="mt-2 flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <X strokeWidth={1.5} className="h-3.5 w-3.5" /> Clear shape
          </button>
        )}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this area"
          aria-label="Area name"
          className="mt-3 h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none"
        />

        <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Detail level">
          {LEVELS.map((l, i) => (
            <button
              key={l.z}
              role="radio"
              aria-checked={level === i}
              onClick={() => setLevel(i)}
              className={`flex-1 rounded-lg py-2 text-xs ${level === i ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {est && (
          <div className="mt-3 rounded-xl border px-3 py-2 text-sm">
            <p className="tnum">
              {est.tiles.toLocaleString()} tiles · about {fmtBytes(est.bytes)}
              <span className="text-muted-foreground"> · zooms 0–{LEVELS[level]!.z}</span>
            </p>
            {est.warning && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-traffic-slow">
                <AlertTriangle strokeWidth={1.5} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {est.warning}
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        {busy && (
          <p className="mt-2 text-sm text-muted-foreground">
            {busy === "index" ? "Building offline search index…" : "Starting download…"}
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            disabled={!canStart}
            onClick={() => void start()}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
          >
            <Download strokeWidth={1.5} className="h-4 w-4" /> Download
          </button>
          {running && (
            <>
              <button
                onClick={pause}
                className="glass flex items-center gap-1 rounded-xl px-3 text-sm"
              >
                <Pause strokeWidth={1.5} className="h-4 w-4" /> Pause
              </button>
              <button
                onClick={cancel}
                className="glass flex items-center gap-1 rounded-xl px-3 text-sm text-destructive"
              >
                <X strokeWidth={1.5} className="h-4 w-4" /> Cancel
              </button>
            </>
          )}
        </div>
        {running && (
          <p className="tnum mt-2 text-xs text-muted-foreground">
            One area at a time, so the map stays usable while it downloads.
          </p>
        )}
      </section>

      {/* -------- downloaded areas -------- */}
      <section className="px-5 pt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="smallcaps text-xs text-muted-foreground">Downloaded</h2>
          <span className="tnum text-xs text-muted-foreground">{fmtBytes(used)} used</span>
        </div>
        <div className="hairline mt-2" />
        {areas.length === 0 && <p className="py-3 text-sm text-muted-foreground">No areas yet.</p>}
        {areas.map((a) => (
          <div key={a.id} className="border-b py-3">
            <div className="flex items-center gap-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => fit(a)}>
                <div className="truncate font-display">{a.name}</div>
                <div className="tnum text-xs text-muted-foreground">
                  {fmtBytes(a.bytes)} · {a.placeCount.toLocaleString()} places · zoom 0–{a.maxZoom}{" "}
                  · {new Date(a.date).toLocaleDateString()}
                </div>
              </button>
              {editing === a.id ? (
                <input
                  autoFocus
                  defaultValue={a.name}
                  onBlur={(e) => {
                    void persist({ ...a, name: e.target.value || a.name });
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                  aria-label="Area name"
                  className="w-32 rounded-md border bg-background px-2 py-1 text-sm outline-none"
                />
              ) : (
                <button
                  onClick={() => setEditing(a.id)}
                  aria-label={`Rename ${a.name}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil strokeWidth={1.5} className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => void refreshArea(a)}
                aria-label={`Update ${a.name}`}
                className="text-muted-foreground hover:text-primary"
              >
                <HardDriveDownload strokeWidth={1.5} className="h-4 w-4" />
              </button>
              <button
                onClick={() => void remove(a)}
                aria-label={`Delete ${a.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 strokeWidth={1.5} className="h-4 w-4" />
              </button>
            </div>
            {(a.state === "downloading" || a.state === "paused") && (
              <div className="mt-2">
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${a.tiles ? Math.min(100, (a.done / a.tiles) * 100) : 0}%` }}
                  />
                </div>
                <p className="tnum mt-1 text-xs text-muted-foreground">
                  {a.state === "paused" ? "Paused" : "Downloading"} · {a.done.toLocaleString()} /{" "}
                  {a.tiles.toLocaleString()} tiles
                </p>
              </div>
            )}
            {a.state === "error" && (
              <p className="mt-1 text-xs text-destructive">{a.error ?? "Download failed."}</p>
            )}
          </div>
        ))}
      </section>

      {/* -------- draw the custom area -------- */}
      {shape.kind !== "none" && <AreaDrawer shape={shape} onChange={setShape} />}

      {areas.some((a) => a.state === "ready") && (
        <section className="px-5 pt-6">
          <h2 className="smallcaps text-xs text-muted-foreground">Searching offline</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Each downloaded area gets its own search index of places and addresses. When you are
            offline, or when the view is inside a downloaded area, search looks there first and
            labels those results as offline.
          </p>
        </section>
      )}

      <p className="flex items-start gap-2 px-5 pt-6 text-xs leading-relaxed text-muted-foreground">
        <PencilRuler strokeWidth={1.5} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Caps: zoom {MAX_ZOOM}, 6,000 tiles and 2,500 km² per area, so a download can never quietly
        fill the device.
      </p>
    </div>
  );
}

/** The OpenFreeMap TileJSON template, fetched once and reused for every area. */
let templatePromise: Promise<string> | null = null;
async function tileTemplate() {
  templatePromise ??= fetch(PLANET_URL)
    .then((r) => r.json())
    .then((j) => String(j.tiles?.[0] ?? "https://tiles.openfreemap.org/planet/{z}/{x}/{y}.pbf"));
  return templatePromise;
}

function zoomFor(bbox: [number, number, number, number]) {
  const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);
  return span > 0 ? Math.min(12, Math.max(3, Math.round(Math.log2(360 / span)))) : 10;
}

const describe = (b: BBox) => `${b[1].toFixed(2)}, ${b[0].toFixed(2)}`;
