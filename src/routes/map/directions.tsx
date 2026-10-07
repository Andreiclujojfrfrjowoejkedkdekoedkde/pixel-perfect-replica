import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  ArrowDown,
  ArrowUp,
  BatteryCharging,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  CloudOff,
  Crosshair,
  LocateFixed,
  Footprints,
  Bike,
  Plus,
  Route as RouteIcon,
  Sparkles,
  X,
} from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { Guidance } from "@/components/nav/Guidance";
import { useSettings, type TravelMode } from "@/lib/settings";
import {
  valhalla,
  photonSearch,
  chargersAlong,
  type Place,
  type Route as RouteLeg,
} from "@/lib/services";
import { fmtDistance, fmtDuration, parseCoords } from "@/lib/format";
import { network } from "@/lib/platform";
import { routeKey, storedRoutes } from "@/lib/routeStore";

const search = z.object({
  to: z.string().optional(),
  toName: z.string().optional(),
  from: z.string().optional(),
  mode: z.enum(["drive", "walk", "cycle"]).optional(),
  depart: z.string().optional(),
  /** Set when arriving from a shortcut: centre the map on the driver first. */
  recenter: z.string().optional(),
});

export const Route = createFileRoute("/map/directions")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Directions — Meridian" },
      {
        name: "description",
        content: "Driving, walking and cycling directions with alternatives and multiple stops.",
      },
      { property: "og:title", content: "Directions on Meridian" },
      { property: "og:description", content: "Plan a route by car, on foot or by bike." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Directions,
});

type Stop = { label: string; coord: [number, number] | null; isMe?: boolean };

const toStop = (s?: string, name?: string): Stop => {
  const c = s ? parseCoords(s) : null;
  return { label: name ?? (c ? s! : ""), coord: c };
};

function StopInput({
  stop,
  onChange,
  placeholder,
  index,
}: {
  stop: Stop;
  onChange: (s: Stop) => void;
  placeholder: string;
  index: number;
}) {
  const [q, setQ] = useState(stop.label);
  const [opts, setOpts] = useState<Place[]>([]);
  const { map, position, setPosition } = useMapState();
  useEffect(() => setQ(stop.label), [stop.label]);
  useEffect(() => {
    if (!q || q === stop.label) {
      setOpts([]);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(() => {
      const c = map
        ? (map.getCenter().toArray() as [number, number])
        : ([0, 0] as [number, number]);
      photonSearch(q, c, ac.signal)
        .then(setOpts)
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, stop.label, map]);

  const useMe = async () => {
    const { location } = await import("@/lib/platform");
    const p = position ?? (await location.once().catch(() => null));
    if (p) {
      setPosition(p);
      onChange({ label: "Your location", coord: [p.lon, p.lat], isMe: true });
    }
  };

  return (
    <div className="relative flex-1">
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3">
        <span className="tnum w-4 text-xs text-muted-foreground">
          {String.fromCharCode(65 + index)}
        </span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            const c = parseCoords(e.target.value);
            if (c) onChange({ label: e.target.value, coord: c });
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          onClick={useMe}
          aria-label="Use my location"
          className="text-muted-foreground hover:text-primary"
        >
          <Crosshair strokeWidth={1.5} className="h-4 w-4" />
        </button>
      </div>
      {opts.length > 0 && (
        <ul className="surface absolute left-0 right-0 top-11 z-50 max-h-64 overflow-y-auto rounded-lg border py-1 shadow-lg">
          {opts.map((o) => (
            <li key={o.id}>
              <button
                onClick={() => {
                  onChange({ label: o.name, coord: [o.lon, o.lat] });
                  setOpts([]);
                }}
                className="w-full px-3 py-2 text-left hover:bg-secondary"
              >
                <div className="truncate text-sm">{o.name}</div>
                <div className="truncate text-xs text-muted-foreground">{o.subtitle}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Distance, duration, tolls and motorway share, for "alternatives at a glance". */
function RouteFacts({
  route,
  best,
  units,
  departure,
}: {
  route: RouteLeg;
  best: RouteLeg | undefined;
  units: "metric" | "imperial";
  departure: Date | undefined;
}) {
  const deltaMin = best ? Math.round((route.duration - best.duration) / 60) : 0;
  const deltaKm = best ? route.distance - best.distance : 0;
  // Toll estimation is explicit: Valhalla returns a summary when costings ask for
  // it, otherwise we say nothing rather than invent a price.
  const tollText = (route as RouteLeg & { summary?: { hasTolls?: boolean } }).summary?.hasTolls
    ? "Tolls"
    : "No tolls";
  const motorwayKm = motorwayLength(route);
  const share = route.distance > 0 ? Math.round((motorwayKm / route.distance) * 100) : 0;
  const arriveBy = departure ? new Date(departure.getTime() + route.duration * 1000) : null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {best && deltaMin > 0 && (
        <span className="tnum">
          +{fmtDuration(Math.abs(deltaMin * 60))}
          {Math.abs(deltaKm) > 50 ? ` · ${fmtDistance(Math.abs(deltaKm), units)}` : ""}
        </span>
      )}
      <span>{tollText}</span>
      <span className="tnum">{share}% motorway</span>
      {arriveBy && (
        <span className="tnum flex items-center gap-1">
          <Clock strokeWidth={2} className="h-3 w-3" /> arrive{" "}
          {arriveBy.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </div>
  );
}

/** Rough motorway share from the road classes Valhalla returns on maneuvers. */
function motorwayLength(route: RouteLeg): number {
  let total = 0;
  for (const m of route.maneuvers) {
    const street = m.street.toLowerCase();
    const name = m.instruction.toLowerCase();
    const motorway =
      /motorway|freeway|expressway|\bm-?\d+\b/.test(street) ||
      /take the (ramp|exit|slip road)/.test(name);
    total += motorway ? m.length : 0;
  }
  return total;
}

/** Bounding box of a route, as MapLibre wants it. */
function routeBounds(coords: [number, number][]): [[number, number], [number, number]] {
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

/** Leaves room for the panel on wide screens and the sheet on narrow ones. */
function fitPadding() {
  return innerWidth < 768
    ? { top: 80, bottom: innerHeight * 0.5 + 20, left: 30, right: 30 }
    : { top: 60, bottom: 60, left: innerWidth >= 768 ? 440 : 60, right: 80 };
}

function Directions() {
  const sp = Route.useSearch();
  const navigate = useNavigate();
  const { settings, update } = useSettings();
  const {
    map,
    routes,
    setRoutes,
    activeRoute,
    setActiveRoute,
    navigating,
    setNavigating,
    position,
    setPosition,
    setMarkers,
  } = useMapState();
  const [stops, setStops] = useState<Stop[]>(() => [toStop(sp.from), toStop(sp.to, sp.toName)]);
  const [mode, setMode] = useState<TravelMode>(sp.mode ?? settings.travelMode);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [departAt, setDepartAt] = useState<string>(sp.depart ?? "");
  const [chargers, setChargers] = useState<Place[]>([]);
  /** Which stop the next map click fills, if any. */
  const [picking, setPicking] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [offlineRoute, setOfflineRoute] = useState(false);

  useEffect(() => {
    if (!stops[0]?.coord && position) {
      setStops((s) => [
        { label: "Your location", coord: [position.lon, position.lat], isMe: true },
        ...s.slice(1),
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  /**
   * Arriving from a shortcut (or tapping locate) frames the driver before the
   * route fits itself, so the map opens on you rather than on a pin.
   */
  const recenter = useCallback(async () => {
    const { location } = await import("@/lib/platform");
    setLocating(true);
    try {
      const p = position ?? (await location.once());
      setPosition(p);
      map?.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 15) });
      setStops((s) =>
        s[0]?.coord
          ? s
          : [{ label: "Your location", coord: [p.lon, p.lat], isMe: true }, ...s.slice(1)],
      );
    } catch {
      setError("Could not get your location.");
    } finally {
      setLocating(false);
    }
  }, [map, position, setPosition]);

  useEffect(() => {
    if (sp.recenter) void recenter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.recenter]);

  // Clicking the map fills the stop the driver is editing.
  useEffect(() => {
    if (!map || picking == null) return;
    const onClick = (e: { lngLat: { lng: number; lat: number } }) => {
      const { lng, lat } = e.lngLat;
      setStops((all) =>
        all.map((s, j) =>
          j === picking
            ? {
                label: `Map point ${String.fromCharCode(65 + j)}`,
                coord: [lng, lat],
              }
            : s,
        ),
      );
      setPicking(null);
    };
    map.on("click", onClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [map, picking]);

  const key = useMemo(
    () =>
      JSON.stringify([
        stops.map((s) => s.coord),
        mode,
        settings.avoidTolls,
        settings.avoidHighways,
        settings.avoidFerries,
        settings.avoidUnpaved,
      ]),
    [stops, mode, settings],
  );

  useEffect(() => {
    const coords = stops.map((s) => s.coord).filter(Boolean) as [number, number][];
    if (coords.length < 2 || coords.length !== stops.length) {
      setRoutes([]);
      return;
    }

    const first = coords[0]!;
    const last = coords[coords.length - 1]!;
    const cached = storedRoutes.find(first, last, mode);

    if (!network.online()) {
      // No connection: replay a route we already know, or say so plainly.
      if (cached) {
        setRoutes([cached.route], 0);
        setOfflineRoute(true);
        setError(null);
        map?.fitBounds(routeBounds(cached.route.coords), { padding: fitPadding(), duration: 700 });
      } else {
        setRoutes([]);
        setError(
          "You are offline and this journey has not been saved yet. Meridian cannot invent a route — reconnect once and it will remember this trip for next time.",
        );
      }
      return;
    }

    setOfflineRoute(false);
    let live = true;
    setLoading(true);
    setError(null);
    valhalla
      .route(coords, { mode, ...settings })
      .then((r) => {
        if (!live) return;
        setRoutes(r, 0);
        map?.fitBounds(routeBounds(r[0]!.coords), { padding: fitPadding(), duration: 900 });
        // Remember it: this journey will then work offline next time.
        storedRoutes.put({
          key: routeKey(first, last, mode),
          route: r[0]!,
          mode,
          originLabel: stops[0]!.label || "Start",
          destinationLabel: stops[stops.length - 1]!.label || "Destination",
        });
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);

  // Count the journey as driven so frequently used routes stay at the top.
  useEffect(() => {
    if (!navigating || !routes[activeRoute]) return;
    const first = stops[0]?.coord;
    const last = stops[stops.length - 1]?.coord;
    if (!first || !last) return;
    const k = routeKey(first, last, mode);
    if (!storedRoutes.get(k)) {
      storedRoutes.put({
        key: k,
        route: routes[activeRoute]!,
        mode,
        originLabel: stops[0]!.label || "Start",
        destinationLabel: stops[stops.length - 1]!.label || "Destination",
      });
    }
    storedRoutes.markDriven(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigating]);

  // EV charging stops along the chosen route, inside the driver's range.
  useEffect(() => {
    const route = routes[activeRoute];
    if (!route || !settings.vehicle.evRange || settings.vehicle.evRange <= 0) {
      setChargers([]);
      setMarkers([]);
      return;
    }
    let live = true;
    const ac = new AbortController();
    chargersAlong(route.coords, settings.vehicle.evRange, ac.signal)
      .then((r) => {
        if (!live) return;
        setChargers(r);
        setMarkers(r);
      })
      .catch(() => {});
    return () => {
      live = false;
      ac.abort();
      setMarkers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, activeRoute, settings.vehicle.evRange]);

  useEffect(
    () => () => {
      setRoutes([]);
      setNavigating(false);
    },
    [],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  if (navigating && routes[activeRoute]) {
    return (
      <Guidance
        route={routes[activeRoute]}
        destination={stops[stops.length - 1]!.coord!}
        stops={stops.map((s) => s.coord!)}
        mode={mode}
        originLabel={stops[0]!.label || "Start"}
        destinationLabel={stops[stops.length - 1]!.label || "Destination"}
        onEnd={() => setNavigating(false)}
      />
    );
  }

  const move = (i: number, d: number) =>
    setStops((s) => {
      const n = [...s];
      [n[i], n[i + d]] = [n[i + d]!, n[i]!];
      return n;
    });

  const optimize = () => {
    // Nearest-neighbour ordering from the first stop. Cheap, and for the
    // two-to-five stops people actually plan it is close enough to be useful.
    if (stops.length < 3) return;
    const fixed = stops[0]!;
    const rest = stops.slice(1).filter((s) => s.coord);
    const out: Stop[] = [fixed];
    let at = fixed.coord;
    while (rest.length) {
      let bestI = 0;
      let bestD = Infinity;
      rest.forEach((s, i) => {
        if (!s.coord || !at) return;
        const dx = (s.coord[0] - at[0]) ** 2;
        const dy = (s.coord[1] - at[1]) ** 2;
        const d = dx + dy;
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      });
      const next = rest.splice(bestI, 1)[0]!;
      out.push(next);
      at = next.coord;
    }
    setStops(out);
  };

  const modes: { id: TravelMode; label: string; Icon: typeof Car }[] = [
    { id: "drive", label: "Drive", Icon: Car },
    { id: "walk", label: "Walk", Icon: Footprints },
    { id: "cycle", label: "Cycle", Icon: Bike },
  ];
  const best = routes[0];
  const chosen = routes[activeRoute];
  const steps = chosen?.maneuvers ?? [];
  const visibleSteps = showAllSteps ? steps : steps.slice(0, 6);
  const departure = departAt ? new Date(departAt) : undefined;

  return (
    <div className="pb-8">
      <header className="flex items-center justify-between px-5 pt-5">
        <h1 className="font-display text-2xl">Directions</h1>
        <button
          onClick={() => navigate({ to: "/map" })}
          aria-label="Close directions"
          className="text-muted-foreground hover:text-foreground"
        >
          <X strokeWidth={1.5} />
        </button>
      </header>

      <div className="mt-3 flex gap-1 px-5" role="radiogroup" aria-label="Travel mode">
        {modes.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="radio"
            aria-checked={mode === id}
            onClick={() => {
              setMode(id);
              update({ travelMode: id });
            }}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm ${mode === id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
          >
            <Icon strokeWidth={1.5} className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2 px-5">
        {stops.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <StopInput
              index={i}
              stop={s}
              placeholder={i === 0 ? "Start" : i === stops.length - 1 ? "Destination" : "Stop"}
              onChange={(n) => setStops((all) => all.map((x, j) => (j === i ? n : x)))}
            />
            <div className="flex flex-col">
              <button
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label="Move stop earlier"
                className="text-muted-foreground hover:text-foreground disabled:opacity-25"
              >
                <ArrowUp strokeWidth={1.5} className="h-3.5 w-3.5" />
              </button>
              <button
                disabled={i === stops.length - 1}
                onClick={() => move(i, 1)}
                aria-label="Move stop later"
                className="text-muted-foreground hover:text-foreground disabled:opacity-25"
              >
                <ArrowDown strokeWidth={1.5} className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              onClick={() => setPicking((p) => (p === i ? null : i))}
              aria-pressed={picking === i}
              aria-label={`Choose ${i === 0 ? "start" : i === stops.length - 1 ? "destination" : "stop"} on the map`}
              title="Pick this point on the map"
              className={`shrink-0 rounded-lg p-1.5 ${picking === i ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Crosshair strokeWidth={1.5} className="h-4 w-4" />
            </button>
            {stops.length > 2 && (
              <button
                onClick={() => setStops((all) => all.filter((_, j) => j !== i))}
                aria-label="Remove stop"
                className="text-muted-foreground hover:text-foreground"
              >
                <X strokeWidth={1.5} className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {picking != null && (
          <p
            role="status"
            className="flex items-center justify-between gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-sm"
          >
            <span>
              Tap the map to set{" "}
              <strong>
                {picking === 0
                  ? "the start"
                  : picking === stops.length - 1
                    ? "the destination"
                    : `stop ${String.fromCharCode(65 + picking)}`}
              </strong>
              .
            </span>
            <button
              onClick={() => setPicking(null)}
              className="shrink-0 text-xs text-primary hover:underline"
            >
              Cancel
            </button>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <button
            onClick={() => void recenter()}
            disabled={locating}
            className="flex items-center gap-1.5 text-sm text-primary disabled:opacity-50"
          >
            <LocateFixed strokeWidth={1.5} className="h-4 w-4" />
            {locating ? "Locating…" : "Use my location"}
          </button>
          {stops.length < 6 && (
            <button
              onClick={() =>
                setStops((s) => [...s.slice(0, -1), { label: "", coord: null }, s[s.length - 1]!])
              }
              className="flex items-center gap-1.5 text-sm text-primary"
            >
              <Plus strokeWidth={1.5} className="h-4 w-4" /> Add stop
            </button>
          )}
          {stops.length > 2 && (
            <button
              onClick={optimize}
              className="flex items-center gap-1.5 text-sm text-primary"
              title="Reorder stops into the shortest sensible order"
            >
              <Sparkles strokeWidth={1.5} className="h-4 w-4" /> Optimize order
            </button>
          )}
        </div>
      </div>

      {mode === "drive" && (
        <fieldset className="mt-4 flex flex-wrap gap-x-4 gap-y-2 px-5 text-sm">
          <legend className="smallcaps mb-1 text-xs text-muted-foreground">Avoid</legend>
          {(
            [
              ["avoidTolls", "Tolls"],
              ["avoidHighways", "Highways"],
              ["avoidFerries", "Ferries"],
              ["avoidUnpaved", "Unpaved"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-primary"
                checked={settings[k]}
                onChange={(e) => update({ [k]: e.target.checked })}
              />{" "}
              {l}
            </label>
          ))}
        </fieldset>
      )}

      <div className="hairline mx-5 mt-4" />

      <div className="px-5 pt-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock strokeWidth={1.5} className="h-3.5 w-3.5" />
          Leave at
          <input
            type="datetime-local"
            value={departAt}
            onChange={(e) => setDepartAt(e.target.value)}
            className="h-9 flex-1 rounded-lg border bg-background px-2 text-sm"
          />
          {departAt && (
            <button
              onClick={() => setDepartAt("")}
              aria-label="Clear departure time"
              className="text-muted-foreground hover:text-foreground"
            >
              <X strokeWidth={1.5} className="h-4 w-4" />
            </button>
          )}
        </label>
      </div>

      {loading && <p className="px-5 pt-3 text-sm text-muted-foreground">Finding routes</p>}
      {error && <p className="px-5 pt-3 text-sm text-destructive">{error}</p>}
      {offlineRoute && !error && (
        <div
          role="status"
          className="mx-5 mt-3 flex items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-xs leading-relaxed text-muted-foreground"
        >
          <CloudOff strokeWidth={1.5} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Offline: showing a route you have driven before. Live rerouting and traffic need a
            connection.
          </span>
        </div>
      )}

      <ul className="pt-2">
        {routes.map((r, i) => (
          <li key={i}>
            <button
              onClick={() => setActiveRoute(i)}
              aria-pressed={i === activeRoute}
              className={`flex w-full items-start gap-3 border-l-4 px-5 py-3 text-left ${i === activeRoute ? "border-primary bg-secondary/60" : "border-transparent hover:bg-secondary/40"}`}
            >
              <span className="flex-1">
                <span className="flex items-baseline gap-2">
                  <span
                    className={`tnum font-display text-xl ${i === activeRoute ? "text-primary" : ""}`}
                  >
                    {fmtDuration(r.duration)}
                  </span>
                  <span className="tnum text-xs text-muted-foreground">
                    {fmtDistance(r.distance, settings.units)}
                  </span>
                </span>
                <RouteFacts route={r} best={best} units={settings.units} departure={departure} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {chargers.length > 0 && (
        <section className="px-5 pt-4">
          <h2 className="smallcaps flex items-center gap-1.5 text-xs text-muted-foreground">
            <BatteryCharging strokeWidth={1.5} className="h-3.5 w-3.5 text-primary" />
            Charging stops within {settings.vehicle.evRange} km
          </h2>
          <ul className="mt-2 divide-y">
            {chargers.slice(0, 6).map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{p.kind}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {chosen && (
        <div className="px-5 pt-4">
          <button
            onClick={() => setNavigating(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-medium text-primary-foreground hover:bg-primary-hover"
          >
            <RouteIcon strokeWidth={1.5} className="h-4 w-4" /> Start
          </button>

          <ol className="mt-5 space-y-3 text-sm">
            {visibleSteps.map((m, i) => (
              <li key={i} className="flex gap-3">
                <span className="tnum w-14 shrink-0 text-right text-xs text-muted-foreground">
                  {m.length > 0 ? fmtDistance(m.length, settings.units) : ""}
                </span>
                <span>{m.instruction}</span>
              </li>
            ))}
          </ol>

          {steps.length > 6 && (
            <button
              onClick={() => setShowAllSteps((s) => !s)}
              className="mt-3 flex items-center gap-1.5 text-sm text-primary hover:underline"
              aria-expanded={showAllSteps}
            >
              {showAllSteps ? (
                <>
                  <ChevronUp strokeWidth={1.5} className="h-4 w-4" /> Hide steps
                </>
              ) : (
                <>
                  <ChevronDown strokeWidth={1.5} className="h-4 w-4" /> Show all {steps.length}{" "}
                  steps
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
