import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";
import { z } from "zod";
import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  Car,
  GraduationCap,
  Heart,
  Home as HomeIcon,
  MapPin,
  Plus,
  RotateCcw,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import {
  defaultSettings,
  env,
  useSettings,
  VOICE_LANGUAGES,
  type Settings,
  type VehicleProfile,
} from "@/lib/settings";
import { library, useLibrary } from "@/lib/library";
import { AccountPanel } from "@/components/account/AccountPanel";
import { LiquidBackdrop } from "@/components/shell/LiquidBackdrop";
import { useNamedPlaces, namedPlaces } from "@/lib/places";
import { tts } from "@/lib/platform";
import { useTrips, clearTrips } from "@/lib/trips";
import type { Place } from "@/lib/services";

const search = z.object({ focus: z.string().optional() });
export const Route = createFileRoute("/settings")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Settings — Meridian" },
      {
        name: "description",
        content: "Units, theme, map, navigation, vehicle and account preferences for Meridian.",
      },
      { property: "og:title", content: "Meridian settings" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

/* ---------------- layout ---------------- */

function Card({
  title,
  hint,
  children,
  id,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="glass scroll-mt-24 rounded-2xl p-5">
      <h2 className="font-display text-lg">{title}</h2>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      <div className="mt-3 divide-y divide-border/60">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

/* ---------------- page ---------------- */

const WIDGET_CHOICES = [
  { id: "home", label: "Take me home", icon: HomeIcon },
  { id: "work", label: "Take me to work", icon: Briefcase },
  { id: "school", label: "Take me to school", icon: GraduationCap },
  { id: "favourites", label: "My favourites", icon: Heart },
];

const SLOT_ICONS: Record<string, typeof HomeIcon> = {
  home: HomeIcon,
  work: Briefcase,
  school: GraduationCap,
  favourite: Heart,
};

function SettingsPage() {
  const { settings: s, update } = useSettings();
  const navigate = useNavigate();
  const sp = Route.useSearch();
  const { places, lists } = useNamedPlaces();
  const { saved } = useLibrary();
  const trips = useTrips();
  const pageRef = useRef<HTMLDivElement>(null);

  const toggle = (k: keyof Settings) => (
    <input
      type="checkbox"
      className="h-5 w-5 accent-primary"
      checked={s[k] as boolean}
      onChange={(e) => update({ [k]: e.target.checked })}
      aria-label={String(k)}
    />
  );
  const select = <K extends keyof Settings>(k: K, opts: [Settings[K], string][]) => (
    <select
      value={String(s[k])}
      onChange={(e) =>
        update({ [k]: opts.find(([v]) => String(v) === e.target.value)![0] } as Partial<Settings>)
      }
      className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
      aria-label={String(k)}
    >
      {opts.map(([v, l]) => (
        <option key={String(v)} value={String(v)}>
          {l}
        </option>
      ))}
    </select>
  );
  const range = (
    k: keyof Settings,
    min: number,
    max: number,
    step: number,
    fmt?: (v: number) => string,
  ) => (
    <span className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={s[k] as number}
        onChange={(e) => update({ [k]: +e.target.value } as Partial<Settings>)}
        className="w-28 accent-primary"
        aria-label={String(k)}
      />
      <span className="tnum w-14 text-right text-xs text-muted-foreground">
        {fmt ? fmt(s[k] as number) : String(s[k])}
      </span>
    </span>
  );

  // Deep link from the home screen ("Edit", "Set this address in Settings").
  useEffect(() => {
    if (!sp.focus) return;
    const el = document.getElementById(sp.focus);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sp.focus]);

  const pickPlace = (slot: string, existing?: Place) => {
    const name = window.prompt(
      `Coordinates or place name for ${slot}`,
      existing ? `${existing.lat},${existing.lon}` : "",
    );
    if (!name) return;
    const m = name.split(/[,;\s]+/).map(Number);
    const coord =
      m.length >= 2 && m.every((v) => Number.isFinite(v))
        ? ([m[0]!, m[1]!] as [number, number])
        : null;
    const place: Place = coord
      ? {
          id: `@${coord[1]},${coord[0]}`,
          name: name.trim(),
          subtitle: "",
          kind: slot,
          lon: coord[0],
          lat: coord[1],
        }
      : {
          id: `@${slot}-${Date.now().toString(36)}`,
          name: name.trim(),
          subtitle: "",
          kind: slot,
          lon: 0,
          lat: 0,
        };
    namedPlaces.setSlot(slot, place);
  };

  const vehicle = s.vehicle;
  const setVehicle = (patch: Partial<VehicleProfile>) =>
    update({ vehicle: { ...vehicle, ...patch } });

  const shareList = async () => {
    const data = btoa(
      JSON.stringify(
        lists.map((l) => ({
          label: l.label,
          items: namedPlaces.inList(l.id).map((p) => [p.name, p.lat, p.lon]),
        })),
      ),
    );
    const url = `${location.origin}/settings#list=${encodeURIComponent(data)}`;
    try {
      await navigator.clipboard.writeText(url);
      window.alert("Link copied. Anyone with it can see these lists.");
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <div className="relative min-h-screen">
      <LiquidBackdrop />
      <div
        ref={pageRef}
        className="mx-auto w-full max-w-6xl px-5 pb-20 pt-[calc(env(safe-area-inset-top)+1.5rem)]"
      >
        <header className="sticky top-0 z-30 -mx-5 mb-6 flex items-center gap-3 bg-background/70 px-5 py-3 backdrop-blur-md">
          <button
            onClick={() => navigate({ to: "/" })}
            aria-label="Back to home"
            className="glass flex h-10 w-10 items-center justify-center rounded-xl"
          >
            <ArrowLeft strokeWidth={1.5} className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl leading-none">Settings</h1>
            <p className="smallcaps mt-1 text-[11px] text-muted-foreground">
              Tune Meridian to the way you travel
            </p>
          </div>
          <button
            onClick={() => {
              if (window.confirm("Reset every preference to its default?")) {
                update(defaultSettings);
              }
            }}
            className="glass hidden h-10 items-center gap-2 rounded-xl px-3 text-sm sm:flex"
          >
            <RotateCcw strokeWidth={1.5} className="h-4 w-4" /> Reset
          </button>
        </header>

        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-5">
            <Card title="Home screen" hint="Pick which shortcuts appear on your home screen.">
              <div className="space-y-2 py-3">
                {WIDGET_CHOICES.map((w) => {
                  const on = s.homeWidgets.includes(w.id);
                  const Icon = w.icon;
                  return (
                    <label
                      key={w.id}
                      className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5"
                    >
                      <span className="flex items-center gap-2.5 text-sm">
                        <Icon strokeWidth={1.5} className="h-4 w-4 text-primary" /> {w.label}
                      </span>
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-primary"
                        checked={on}
                        onChange={() =>
                          update({
                            homeWidgets: on
                              ? s.homeWidgets.filter((x) => x !== w.id)
                              : [...s.homeWidgets, w.id],
                          })
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </Card>

            <Card
              title="Saved places"
              hint="Home, work and school drive the home-screen shortcuts."
            >
              <div className="space-y-2 py-3">
                {["home", "work", "school"].map((slot) => {
                  const p = places.find((x) => x.list === slot);
                  const Icon = SLOT_ICONS[slot]!;
                  return (
                    <div
                      key={slot}
                      className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
                    >
                      <Icon strokeWidth={1.5} className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="smallcaps block text-[11px] text-muted-foreground">
                          {slot}
                        </span>
                        <span className="block truncate text-sm">{p ? p.name : "Not set"}</span>
                      </span>
                      <button
                        onClick={() => pickPlace(slot, p)}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs text-primary hover:bg-secondary"
                      >
                        {p ? "Change" : "Set"}
                      </button>
                      {p && (
                        <button
                          onClick={() => namedPlaces.setSlot(slot, null)}
                          aria-label={`Clear ${slot}`}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 strokeWidth={1.5} className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Lists" hint="Group places, then share a list with a link.">
              <div className="space-y-2 py-3">
                {lists.map((l) => {
                  const items = namedPlaces.inList(l.id);
                  return (
                    <div
                      key={l.id}
                      className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{l.label}</span>
                        <span className="tnum block text-xs text-muted-foreground">
                          {items.length} place{items.length === 1 ? "" : "s"}
                        </span>
                      </span>
                      {!l.builtin && (
                        <button
                          onClick={() => namedPlaces.removeList(l.id)}
                          aria-label={`Delete list ${l.label}`}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 strokeWidth={1.5} className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const label = window.prompt("Name this list");
                      if (label) namedPlaces.addList(label);
                    }}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"
                  >
                    <Plus strokeWidth={1.5} className="h-4 w-4" /> New list
                  </button>
                  <button
                    onClick={() => void shareList()}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"
                  >
                    <Share2 strokeWidth={1.5} className="h-4 w-4" /> Share
                  </button>
                </div>
              </div>
            </Card>

            <Card title="Account" hint="Saved places and settings sync between your devices.">
              <div className="py-3">
                <AccountPanel />
              </div>
            </Card>
          </div>

          <div className="space-y-5">
            <Card title="General">
              <Row label="Units">
                {select("units", [
                  ["metric", "Kilometres"],
                  ["imperial", "Miles"],
                ])}
              </Row>
              <Row label="Theme">
                {select("theme", [
                  ["auto", "Automatic"],
                  ["light", "Light"],
                  ["dark", "Dark"],
                ])}
              </Row>
              <Row label="Time format">
                {select("timeFormat", [
                  ["24h", "24-hour"],
                  ["12h", "12-hour"],
                ])}
              </Row>
              <Row label="Left-handed controls" hint="Puts map controls on the left.">
                {toggle("leftHanded")}
              </Row>
            </Card>

            <Card title="Map">
              <Row label="Default mode">
                {select("defaultMode", [
                  ["standard", "Standard"],
                  ["3d", "3D"],
                  ["earth", "Earth"],
                  ["street", "Street view"],
                ])}
              </Row>
              <Row label="3D buildings">{toggle("buildings3d")}</Row>
              <Row label="Label size">
                {range("labelScale", 0.8, 1.4, 0.1, (v) => `${v.toFixed(1)}×`)}
              </Row>
              <Row label="Labels on satellite">{toggle("earthLabels")}</Row>
            </Card>

            <Card title="Navigation">
              <Row label="Voice guidance">{toggle("voice")}</Row>
              <Row label="Voice language" hint="Spoken instructions use this language.">
                <select
                  value={s.voiceLanguage}
                  onChange={(e) => update({ voiceLanguage: e.target.value })}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                >
                  {VOICE_LANGUAGES.map((l) => (
                    <option key={l.tag} value={l.tag}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Voice volume">
                {range("volume", 0, 1, 0.1, (v) => `${Math.round(v * 100)}%`)}
              </Row>
              <Row label="Try the voice">
                <button
                  onClick={() => tts.speak("Recalculating your route.", s.volume, s.voiceLanguage)}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"
                >
                  Play
                </button>
              </Row>
              <Row label="Default travel mode">
                {select("travelMode", [
                  ["drive", "Drive"],
                  ["walk", "Walk"],
                  ["cycle", "Cycle"],
                ])}
              </Row>
              <Row label="Speed tolerance" hint="How far over the limit before the pill turns red.">
                {select("speedTolerance", [
                  [0, "0 km/h"],
                  [5, "5 km/h"],
                  [10, "10 km/h"],
                ])}
              </Row>
              <Row label="Posted speed limits" hint="Signs from OSM maxspeed tags along the route.">
                {toggle("postedLimits")}
              </Row>
              <Row label="Keep screen on">{toggle("keepScreenOn")}</Row>
            </Card>

            <Card title="Alerts">
              <Row label="Speed camera warnings" hint="From OSM highway=speed_camera nodes.">
                {toggle("cameraAlerts")}
              </Row>
              <Row label="School zone warnings">{toggle("schoolAlerts")}</Row>
            </Card>
          </div>

          <div className="space-y-5">
            <Card
              title="Your vehicle"
              hint="Height, weight and range feed route restrictions and stops."
            >
              <Row label="Vehicle type">
                <span className="flex items-center gap-2">
                  <select
                    value={vehicle.kind}
                    onChange={(e) => setVehicle({ kind: e.target.value as VehicleProfile["kind"] })}
                    className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    <option value="car">Car</option>
                    <option value="van">Van</option>
                    <option value="truck">Truck</option>
                  </select>
                </span>
              </Row>
              <Row
                label="Height"
                hint={
                  s.units === "imperial"
                    ? "Feet. 0 for no restriction."
                    : "Metres. 0 for no restriction."
                }
              >
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={s.units === "imperial" ? 0.5 : 0.1}
                    value={
                      Math.round(vehicle.height * (s.units === "imperial" ? 3.28084 : 1) * 100) /
                      100
                    }
                    onChange={(e) =>
                      setVehicle({
                        height:
                          Math.max(0, +e.target.value) / (s.units === "imperial" ? 3.28084 : 1),
                      })
                    }
                    className="tnum h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    {s.units === "imperial" ? "ft" : "m"}
                  </span>
                </span>
              </Row>
              <Row
                label="Weight"
                hint={
                  s.units === "imperial"
                    ? "Pounds. 0 for no restriction."
                    : "Tonnes. 0 for no restriction."
                }
              >
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={
                      Math.round(vehicle.weight * (s.units === "imperial" ? 2204.62 : 1) * 100) /
                      100
                    }
                    onChange={(e) =>
                      setVehicle({
                        weight:
                          Math.max(0, +e.target.value) / (s.units === "imperial" ? 2204.62 : 1),
                      })
                    }
                    className="tnum h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    {s.units === "imperial" ? "lb" : "t"}
                  </span>
                </span>
              </Row>
              {vehicle.kind === "truck" && (
                <Row label="Axle weight">
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={vehicle.axleWeight}
                      onChange={(e) => setVehicle({ axleWeight: Math.max(0, +e.target.value) })}
                      className="tnum h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">t</span>
                  </span>
                </Row>
              )}
              <Row label="EV range" hint="Kilometres. 0 hides charging stops.">
                <input
                  type="number"
                  min={0}
                  step={10}
                  value={vehicle.evRange}
                  onChange={(e) => setVehicle({ evRange: Math.max(0, +e.target.value) })}
                  className="tnum h-9 w-24 rounded-lg border border-border bg-background px-2 text-sm"
                />
              </Row>
            </Card>
            <Card title="Trips" hint="Kept on this device unless you are signed in.">
              <Row label="Record trip history">{toggle("tripHistory")}</Row>
              <Row label="Trips recorded">
                <span className="tnum text-sm text-muted-foreground">{trips.length}</span>
              </Row>
              <Row label="Clear history">
                <button
                  onClick={() => clearTrips()}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-secondary"
                >
                  Clear
                </button>
              </Row>
            </Card>
            <Card title="Privacy">
              <Row label="Keep search history">{toggle("locationHistory")}</Row>
              <Row label="Recent searches">
                <button
                  onClick={() => library.clearRecent()}
                  className="text-primary hover:underline"
                >
                  Clear history
                </button>
              </Row>
              <Row label="Saved places">
                <span className="tnum text-sm text-muted-foreground">{saved.length}</span>
              </Row>
            </Card>
            <Card title="Services">
              <p className="py-2 text-sm text-muted-foreground">
                {env.mapillary
                  ? "Street imagery is connected."
                  : "Street imagery is off. Add a Mapillary token to turn it on."}
              </p>
              <p className="py-2 text-sm text-muted-foreground">
                {env.maptiler ? "Using MapTiler tiles." : "Using OpenFreeMap tiles."}
              </p>
            </Card>
            <Card title="About">
              <div className="space-y-1 py-3 text-xs leading-relaxed text-muted-foreground">
                <p>Meridian 0.2</p>
                <p>
                  Map data © OpenStreetMap contributors. Tiles by{" "}
                  {env.maptiler ? "MapTiler" : "OpenFreeMap"}. Search by Photon (komoot). Routing by
                  Valhalla, FOSSGIS. Imagery © Esri. Terrain: Mapzen, AWS Open Data. Street imagery
                  © Mapillary.
                </p>
                <Link to="/map/offline" className="inline-block pt-1 text-primary hover:underline">
                  Offline maps
                </Link>
              </div>
            </Card>{" "}
          </div>
        </div>
      </div>
    </div>
  );
}
