import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Briefcase,
  Download,
  GraduationCap,
  Heart,
  Home as HomeIcon,
  Map as MapIcon,
  Search as SearchIcon,
  Settings as Cog,
  SlidersHorizontal,
  Navigation,
} from "lucide-react";
import { LiquidBackdrop } from "@/components/shell/LiquidBackdrop";
import { QuickSearch } from "@/components/search/QuickSearch";
import { useNamedPlaces, namedPlaces, FAVORITES } from "@/lib/places";
import { useSettings } from "@/lib/settings";
import { fmtDistance, haversine, parseCoords } from "@/lib/format";
import { library } from "@/lib/library";
import type { Place } from "@/lib/services";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Meridian — a living atlas of the world" },
      {
        name: "description",
        content: "Search places, navigate, and take your maps offline with Meridian.",
      },
      { property: "og:title", content: "Meridian — a living atlas of the world" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomeScreen,
});

type WidgetSpec = { id: string; label: string; icon: typeof HomeIcon; slot: string };

const WIDGETS: WidgetSpec[] = [
  { id: "home", label: "Take me home", icon: HomeIcon, slot: "home" },
  { id: "work", label: "Take me to work", icon: Briefcase, slot: "work" },
  { id: "school", label: "Take me to school", icon: GraduationCap, slot: "school" },
  { id: "favourites", label: "My favourites", icon: Heart, slot: FAVORITES },
];

function HomeScreen() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { places, lists } = useNamedPlaces();

  const slots = useMemo(
    () =>
      WIDGETS.map((w) => ({
        ...w,
        target: places.find((p) => p.list === w.slot) ?? null,
      })),
    [places],
  );

  const enabled = settings.homeWidgets;
  const shown = enabled.length ? enabled : ["home", "work"];

  const openPlace = (p: Place) => {
    library.addRecent(p);
    navigate({ to: "/map/place/$id", params: { id: p.id } });
  };

  const goThere = (p: Place) => {
    library.addRecent(p);
    navigate({ to: "/map/directions", search: { to: `${p.lat},${p.lon}`, toName: p.name } });
  };

  return (
    <div className="relative min-h-screen">
      <LiquidBackdrop />

      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-5 pb-16 pt-[calc(env(safe-area-inset-top)+2.5rem)]">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl leading-none sm:text-5xl">Meridian</h1>
            <p className="smallcaps mt-2 text-xs text-muted-foreground">
              A living atlas of the world
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link
              to="/settings"
              className="glass flex h-11 w-11 items-center justify-center rounded-2xl"
              aria-label="Settings"
            >
              <Cog strokeWidth={1.5} className="h-5 w-5" />
            </Link>
          </div>
        </header>

        {/* ---------- search ---------- */}
        <section className="glass rounded-3xl p-2">
          <QuickSearch
            onPick={(p) => {
              library.addRecent(p);
              navigate({ to: "/map/place/$id", params: { id: p.id } });
            }}
            onNavigate={() => navigate({ to: "/map" })}
          />
        </section>

        {/* ---------- primary actions ---------- */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Link
            to="/map"
            className="glass group flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-6 text-sm transition-transform hover:-translate-y-0.5"
          >
            <MapIcon strokeWidth={1.25} className="h-7 w-7 text-primary" />
            <span className="font-medium">Open map</span>
          </Link>
          <Link
            to="/map/directions"
            className="glass group flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-6 text-sm transition-transform hover:-translate-y-0.5"
          >
            <Navigation strokeWidth={1.25} className="h-7 w-7 text-primary" />
            <span className="font-medium">Directions</span>
          </Link>
          <Link
            to="/map/offline"
            className="glass group flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-6 text-sm transition-transform hover:-translate-y-0.5"
          >
            <Download strokeWidth={1.25} className="h-7 w-7 text-primary" />
            <span className="font-medium">Offline</span>
          </Link>
          <Link
            to="/settings"
            className="glass group flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-6 text-sm transition-transform hover:-translate-y-0.5"
          >
            <SlidersHorizontal strokeWidth={1.25} className="h-7 w-7 text-primary" />
            <span className="font-medium">Preferences</span>
          </Link>
        </section>

        {/* ---------- home-screen widgets ---------- */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="smallcaps text-xs text-muted-foreground">Shortcuts</h2>
            <Link
              to="/settings"
              search={{ focus: "widgets" }}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Edit <ArrowRight strokeWidth={2} className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {slots
              .filter((w) => shown.includes(w.id))
              .map((w) => (
                <WidgetCard
                  key={w.id}
                  spec={w}
                  onOpen={openPlace}
                  onGo={goThere}
                  units={settings.units}
                />
              ))}
            {slots.filter((w) => shown.includes(w.id)).length === 0 && (
              <p className="glass rounded-2xl px-5 py-6 text-sm text-muted-foreground sm:col-span-2">
                No shortcuts selected. Add your home and work in Settings to see them here.
              </p>
            )}
          </div>
        </section>

        {/* ---------- lists ---------- */}
        {lists.filter((l) => namedPlaces.inList(l.id).length > 0).length > 0 && (
          <section>
            <h2 className="smallcaps mb-3 text-xs text-muted-foreground">Your lists</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {lists
                .filter((l) => namedPlaces.inList(l.id).length > 0)
                .map((l) => (
                  <div key={l.id} className="glass rounded-2xl p-4">
                    <h3 className="font-display text-lg">{l.label}</h3>
                    <ul className="mt-2 divide-y">
                      {namedPlaces
                        .inList(l.id)
                        .slice(0, 4)
                        .map((p) => (
                          <li key={`${l.id}-${p.id}`}>
                            <button
                              onClick={() => openPlace(p)}
                              className="flex w-full items-center gap-2 py-2 text-left text-sm hover:text-primary"
                            >
                              <span className="min-w-0 flex-1 truncate">{p.name}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {p.kind}
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
            </div>
          </section>
        )}

        <footer className="mt-auto pt-4 text-center text-xs leading-relaxed text-muted-foreground">
          <p>Map data © OpenStreetMap contributors. Routing by Valhalla. Search by Photon.</p>
        </footer>
      </main>
    </div>
  );
}

function WidgetCard({
  spec,
  onOpen,
  onGo,
  units,
}: {
  spec: WidgetSpec & { target: Place | null };
  onOpen: (p: Place) => void;
  onGo: (p: Place) => void;
  units: "metric" | "imperial";
}) {
  const Icon = spec.icon;
  if (!spec.target) {
    return (
      <Link
        to="/settings"
        search={{ focus: spec.id }}
        className="glass flex items-center gap-3 rounded-2xl px-5 py-4 text-left hover:bg-secondary/40"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <Icon strokeWidth={1.5} className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{spec.label}</span>
          <span className="block text-xs text-muted-foreground">Set this address in Settings</span>
        </span>
      </Link>
    );
  }
  const p = spec.target;
  return (
    <div className="glass flex items-center gap-3 rounded-2xl px-5 py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon strokeWidth={1.5} className="h-5 w-5" />
      </span>
      <button onClick={() => onGo(p)} className="min-w-0 flex-1 text-left">
        <span className="block truncate font-medium">{spec.label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {p.name}
          {p.subtitle ? ` · ${p.subtitle}` : ""}
        </span>
      </button>
      <button
        onClick={() => onOpen(p)}
        aria-label={`Open ${p.name}`}
        className="shrink-0 rounded-lg px-2 py-1 text-xs text-primary hover:bg-secondary"
      >
        <SearchIcon strokeWidth={2} className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Distance helper kept here so the home screen can show it once slots resolve. */
export const homeDistance = (a: Place, b: Place) =>
  fmtDistance(haversine([a.lon, a.lat], [b.lon, b.lat]), "metric");

export const coercePlace = (text: string): Place | null => {
  const c = parseCoords(text);
  return c
    ? {
        id: `@${c[1]},${c[0]}`,
        name: text.trim(),
        subtitle: "",
        kind: "Point",
        lon: c[0],
        lat: c[1],
      }
    : null;
};
