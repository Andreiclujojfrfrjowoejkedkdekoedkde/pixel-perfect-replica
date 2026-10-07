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
  Navigation,
  Pencil,
  Search as SearchIcon,
  Settings as Cog,
  SlidersHorizontal,
} from "lucide-react";
import { LiquidBackdrop } from "@/components/shell/LiquidBackdrop";
import { QuickSearch } from "@/components/search/QuickSearch";
import { useNamedPlaces, namedPlaces, FAVORITES } from "@/lib/places";
import { useSettings } from "@/lib/settings";
import { useLibrary, library } from "@/lib/library";
import { fmtDistance, haversine } from "@/lib/format";
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
  const { saved, recent } = useLibrary();

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
  const visible = slots.filter((w) => shown.includes(w.id));

  const openPlace = (p: Place) => {
    library.addRecent(p);
    navigate({ to: "/map/place/$id", params: { id: p.id } });
  };

  /** Start a trip: directions prefilled, and the map zooms to the driver. */
  const goThere = (p: Place) => {
    library.addRecent(p);
    navigate({
      to: "/map/directions",
      search: { to: `${p.lat},${p.lon}`, toName: p.name, recenter: "1" },
    });
  };

  const origin: [number, number] | null = null;

  return (
    <div className="relative min-h-screen">
      <LiquidBackdrop />

      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-7 px-5 pb-20 pt-[calc(env(safe-area-inset-top)+2.25rem)]">
        {/* ---------------- header ---------------- */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[2.75rem] leading-[0.9] tracking-tight sm:text-6xl">
              Meridian
            </h1>
            <p className="smallcaps mt-2 text-[11px] text-muted-foreground">
              A living atlas of the world
            </p>
          </div>
          <Link
            to="/settings"
            className="glass glass-button h-11 w-11"
            aria-label="Settings"
            title="Settings"
          >
            <Cog strokeWidth={1.5} className="h-5 w-5" />
          </Link>
        </header>

        {/* ---------------- search ---------------- */}
        <section className="surface-glass rounded-3xl p-2">
          <QuickSearch onPick={(p) => openPlace(p)} onNavigate={() => navigate({ to: "/map" })} />
        </section>

        {/* ---------------- primary actions ---------------- */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ActionTile to="/map" icon={MapIcon} label="Open map" note="Browse anywhere" />
          <ActionTile
            to="/map/directions"
            icon={Navigation}
            label="Directions"
            note="Plan a trip"
            primary
          />
          <ActionTile to="/map/offline" icon={Download} label="Offline" note="Download areas" />
          <ActionTile
            to="/settings"
            icon={SlidersHorizontal}
            label="Preferences"
            note="Tune Meridian"
          />
        </section>

        {/* ---------------- shortcuts ---------------- */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="smallcaps text-[11px] text-muted-foreground">Shortcuts</h2>
            <Link
              to="/settings"
              search={{ focus: "home" }}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Edit <ArrowRight strokeWidth={2} className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((w) => (
              <WidgetCard
                key={w.id}
                spec={w}
                units={settings.units}
                onGo={goThere}
                onOpen={openPlace}
              />
            ))}
            {visible.length === 0 && (
              <p className="surface-glass rounded-2xl px-5 py-6 text-sm text-muted-foreground sm:col-span-2">
                No shortcuts selected. Add your home and work in Settings to see them here.
              </p>
            )}
          </div>
        </section>

        {/* ---------------- lists + saved ---------------- */}
        {lists.filter((l) => namedPlaces.inList(l.id).length > 0).length > 0 && (
          <section>
            <h2 className="smallcaps mb-3 text-[11px] text-muted-foreground">Your lists</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {lists
                .filter((l) => namedPlaces.inList(l.id).length > 0)
                .map((l) => (
                  <div key={l.id} className="surface-glass rounded-2xl p-4">
                    <h3 className="font-display text-lg">{l.label}</h3>
                    <ul className="mt-1 divide-y divide-border/50">
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
                              {origin && (
                                <span className="tnum shrink-0 text-xs text-muted-foreground">
                                  {fmtDistance(haversine(origin, [p.lon, p.lat]), settings.units)}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
            </div>
          </section>
        )}

        {(saved.length > 0 || recent.length > 0) && (
          <section className="surface-glass rounded-2xl p-4">
            <h2 className="smallcaps mb-2 text-[11px] text-muted-foreground">Recent</h2>
            <div className="flex flex-wrap gap-2">
              {(recent.length ? recent : saved).slice(0, 6).map((p) => (
                <button
                  key={p.id}
                  onClick={() => openPlace(p)}
                  className="rounded-full border border-border/70 px-3 py-1.5 text-sm hover:border-primary hover:text-primary"
                >
                  {p.name}
                </button>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-auto pt-2 text-center text-xs leading-relaxed text-muted-foreground">
          <p>Map data © OpenStreetMap contributors. Routing by Valhalla. Search by Photon.</p>
        </footer>
      </main>
    </div>
  );
}

function ActionTile({
  to,
  icon: Icon,
  label,
  note,
  primary,
}: {
  to: string;
  icon: typeof MapIcon;
  label: string;
  note: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`tile surface-glass flex flex-col items-start justify-end gap-1 px-4 py-5 ${primary ? "tile-primary" : ""}`}
    >
      <Icon strokeWidth={1.25} className={`mb-2 h-6 w-6 ${primary ? "" : "text-primary"}`} />
      <span className="font-display text-lg leading-none">{label}</span>
      <span
        className={`text-[11px] leading-none ${primary ? "opacity-80" : "text-muted-foreground"}`}
      >
        {note}
      </span>
    </Link>
  );
}

function WidgetCard({
  spec,
  onGo,
  onOpen,
  units,
}: {
  spec: WidgetSpec & { target: Place | null };
  onGo: (p: Place) => void;
  onOpen: (p: Place) => void;
  units: "metric" | "imperial";
}) {
  const Icon = spec.icon;

  if (!spec.target) {
    return (
      <Link
        to="/settings"
        search={{ focus: spec.id }}
        className="surface-glass flex items-center gap-3 rounded-2xl px-4 py-4 hover:border-primary/50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-muted-foreground">
          <Icon strokeWidth={1.5} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{spec.label}</span>
          <span className="block text-xs text-muted-foreground">Set this address in Settings</span>
        </span>
        <Pencil strokeWidth={1.5} className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    );
  }

  const p = spec.target;
  return (
    <div className="surface-glass flex items-center gap-3 rounded-2xl px-4 py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon strokeWidth={1.5} className="h-5 w-5" />
      </span>
      <button onClick={() => onGo(p)} className="min-w-0 flex-1 text-left">
        <span className="block font-medium">{spec.label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {p.name}
          {p.subtitle ? ` · ${p.subtitle}` : ""}
        </span>
      </button>
      <button
        onClick={() => onOpen(p)}
        aria-label={`Open ${p.name}`}
        title="Show on the map"
        className="glass-button h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
      >
        <SearchIcon strokeWidth={1.5} className="h-4 w-4" />
      </button>
    </div>
  );
}
