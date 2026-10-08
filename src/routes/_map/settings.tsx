import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useSettings, env, type Settings } from "@/lib/settings";
import { library } from "@/lib/library";
import { Button } from "@/components/ui/button";
import { storage } from "@/lib/platform";
import { clearTrips } from "@/lib/trips";

export const Route = createFileRoute("/_map/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Meridian" },
      { name: "description", content: "Units, theme, map, navigation and privacy preferences for Meridian." },
      { property: "og:title", content: "Meridian settings" },
      { property: "og:description", content: "Tune Meridian to the way you travel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-5 pt-6">
      <h2 className="smallcaps text-xs text-muted-foreground">{title}</h2>
      <div className="hairline mt-2" />
      <div className="divide-y">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm">{label}<span className="shrink-0">{children}</span></label>;
}

function SettingsPage() {
  const { settings: s, update } = useSettings();
  const navigate = useNavigate();
  const toggle = (k: keyof Settings) => (
    <input type="checkbox" className="h-4 w-4 accent-primary" checked={s[k] as boolean} onChange={(e) => update({ [k]: e.target.checked })} />
  );
  const select = <K extends keyof Settings>(k: K, opts: [Settings[K], string][]) => (
    <select value={String(s[k])} onChange={(e) => { const option = opts.find(([v]) => String(v) === e.target.value); if (option) update({ [k]: option[0] } as Partial<Settings>); }} className="rounded-md border bg-background px-2 py-1 text-sm">
      {opts.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
    </select>
  );

  return (
    <div className="pb-10">
      <header className="flex items-center justify-between px-5 pt-5">
        <h1 className="font-display text-2xl">Settings</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/" })} aria-label="Close settings" className="text-muted-foreground hover:text-foreground"><X strokeWidth={1.5} /></Button>
      </header>
      <Section title="General">
        <Row label="Units">{select("units", [["metric", "Kilometres"], ["imperial", "Miles"]])}</Row>
        <Row label="Theme">{select("theme", [["auto", "Automatic"], ["light", "Light"], ["dark", "Dark"]])}</Row>
        <Row label="Time format">{select("timeFormat", [["24h", "24-hour"], ["12h", "12-hour"]])}</Row>
        <Row label="Left-handed controls">{toggle("leftHanded")}</Row>
      </Section>
      <Section title="Map">
        <Row label="Default mode">{select("defaultMode", [["standard", "Standard"], ["3d", "3D"], ["earth", "Earth"], ["street", "Street view"]])}</Row>
        <Row label="3D buildings">{toggle("buildings3d")}</Row>
        <Row label="Label size">
          <input type="range" min={0.8} max={1.4} step={0.1} value={s.labelScale} onChange={(e) => update({ labelScale: +e.target.value })} className="accent-primary" aria-label="Label size" />
        </Row>
        <Row label="Labels on satellite">{toggle("earthLabels")}</Row>
      </Section>
      <Section title="Navigation">
        <Row label="Voice guidance">{toggle("voice")}</Row>
        <Row label="Voice volume">
          <input type="range" min={0} max={1} step={0.1} value={s.volume} onChange={(e) => update({ volume: +e.target.value })} className="accent-primary" aria-label="Voice volume" />
        </Row>
        <Row label="Speed tolerance">{select("speedTolerance", [[0, "0 km/h"], [5, "5 km/h"], [10, "10 km/h"]])}</Row>
        <Row label="Avoid tolls">{toggle("avoidTolls")}</Row>
        <Row label="Avoid highways">{toggle("avoidHighways")}</Row>
        <Row label="Avoid ferries">{toggle("avoidFerries")}</Row>
        <Row label="Avoid unpaved roads">{toggle("avoidUnpaved")}</Row>
        <Row label="Keep screen on">{toggle("keepScreenOn")}</Row>
      </Section>
      <Section title="Privacy">
        <Row label="Keep search history">{toggle("locationHistory")}</Row>
        <div className="flex min-h-12 items-center justify-between py-2 text-sm">
          Recent searches
          <Button variant="ghost" onClick={() => library.clearRecent()} className="text-primary">Clear history</Button>
        </div>
        <Row label="Save trip summaries">{toggle("tripHistory")}</Row>
        <div className="flex flex-wrap gap-2 py-3"><Button asChild variant="outline"><Link to="/history">Trips & stats</Link></Button><Button asChild variant="outline"><Link to="/auth">Account & privacy</Link></Button></div>
        <Button variant="destructive" className="my-3" onClick={() => { if (!window.confirm("Delete saved places, searches, shortcuts, local trip summaries and preferences on this device? Cloud travel data can be deleted in Account & privacy.")) return; library.clearAll(); clearTrips(); storage.clearPersonal(); update({ locationHistory: false, tripHistory: false, syncTrips: false }); }}>Delete my device data</Button>
        <p className="py-3 text-xs text-muted-foreground">Trip summaries expire after 30 days. Routes and GPS traces are never saved. Cloud travel data can be deleted in Account & privacy.</p>
      </Section>
      <Section title="Vehicle">
        <Row label="Profile">{select("vehicleType", [["car", "Car"], ["ev", "Electric car"], ["van", "Van"], ["truck", "Truck"]])}</Row>
        {s.vehicleType === "ev" && <Row label="Full-charge range (km)"><input aria-label="EV range in kilometres" type="number" min={50} max={1000} value={s.evRangeKm} onChange={e => update({ evRangeKm: Math.max(50,Math.min(1000,Number(e.target.value)||50)) })} className="w-20 rounded-md border bg-background p-2" /></Row>}
        {["van","truck"].includes(s.vehicleType) && <><Row label="Height (metres)"><input aria-label="Vehicle height in metres" type="number" min={1} max={6} step={0.1} value={s.vehicleHeight} onChange={e => update({ vehicleHeight: Math.max(1,Math.min(6,Number(e.target.value)||1)) })} className="w-20 rounded-md border bg-background p-2" /></Row><Row label="Weight (tonnes)"><input aria-label="Vehicle weight in tonnes" type="number" min={0.5} max={80} step={0.5} value={s.vehicleWeight} onChange={e => update({ vehicleWeight: Math.max(0.5,Math.min(80,Number(e.target.value)||0.5)) })} className="w-20 rounded-md border bg-background p-2" /></Row><p className="py-3 text-xs text-muted-foreground">Clearance-aware routes require a connection and mapped restrictions. Always obey road signs.</p></>}
      </Section>
      <Section title="Services">
        <Row label="Live traffic overlay">{toggle("liveTraffic")}</Row>
        <p className="py-3 text-xs text-muted-foreground">Live traffic uses TomTom coverage and an account key. Route times remain estimates unless the routing provider supplies traffic.</p>
        <p className="py-3 text-sm text-muted-foreground">
          {env.mapillary ? "Street imagery is connected." : "Street imagery is off. Add a Mapillary token to turn it on."}
        </p>
        <p className="py-3 text-sm text-muted-foreground">
          {env.maptiler ? "Using MapTiler tiles." : "Using OpenFreeMap tiles."}
        </p>
      </Section>
      <Section title="About">
        <div className="space-y-1 py-3 text-xs leading-relaxed text-muted-foreground">
          <p>Meridian 0.1</p>
          <p>Map data © OpenStreetMap contributors. Tiles by {env.maptiler ? "MapTiler" : "OpenFreeMap"}. Search by Photon (komoot). Routing by Valhalla, FOSSGIS. Imagery © Esri. Terrain: Mapzen, AWS Open Data. Street imagery © Mapillary.</p>
        </div>
      </Section>
    </div>
  );
}
