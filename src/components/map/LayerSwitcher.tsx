import { useMapState } from "./MapContext";
import { useSettings, env, type MapMode } from "@/lib/settings";
import standard from "@/assets/mode-standard.jpg";
import threeD from "@/assets/mode-3d.jpg";
import earth from "@/assets/mode-earth.jpg";
import street from "@/assets/mode-street.jpg";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

const MODES: { id: MapMode; label: string; img: string; note: string }[] = [
  { id: "standard", label: "Standard", img: standard, note: "Atlas" },
  { id: "3d", label: "3D", img: threeD, note: "Terrain, buildings" },
  { id: "earth", label: "Earth", img: earth, note: "Satellite globe" },
  { id: "street", label: "Street view", img: street, note: "Imagery coverage" },
];

export function LayerSwitcher({ onClose }: { onClose: () => void }) {
  const { mode, setMode } = useMapState();
  const { settings, update } = useSettings();
  return (
    <div role="dialog" aria-label="Map layers" className="glass w-72 rounded-2xl p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg">Layers</h2>
        <button onClick={onClose} className="smallcaps text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <div className="hairline my-3" />
      <div className="grid grid-cols-2 gap-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            aria-pressed={mode === m.id}
            className="group text-left"
          >
            <div className={`overflow-hidden rounded-lg border-2 ${mode === m.id ? "border-primary" : "border-transparent"}`}>
              <img src={m.img} alt="" loading="lazy" width={816} height={816} className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105" />
            </div>
            <div className={`mt-1 text-sm font-medium ${mode === m.id ? "text-primary" : ""}`}>{m.label}</div>
            <div className="smallcaps text-[10px] text-muted-foreground">{m.note}</div>
          </button>
        ))}
      </div>
      <div className="hairline my-3" />
      <div className="flex items-center justify-between text-sm"><span>Live traffic</span><Switch aria-label="Live traffic" checked={settings.liveTraffic} onCheckedChange={checked => update({ liveTraffic: checked })} /></div>
      {settings.liveTraffic && <div className="mt-3 space-y-2"><div className="flex justify-between text-xs text-muted-foreground"><span>Traffic line size</span><output className="tnum">{settings.trafficThickness.toFixed(1)}×</output></div><Slider aria-label="Traffic line size" min={0.5} max={2} step={0.1} value={[settings.trafficThickness]} onValueChange={value => { if (value[0] !== undefined) update({ trafficThickness: value[0] }); }} /></div>}
      {mode === "earth" && (
        <label className="mt-3 flex items-center justify-between text-sm">
          Place labels
          <input type="checkbox" className="accent-primary" checked={settings.earthLabels} onChange={(e) => update({ earthLabels: e.target.checked })} />
        </label>
      )}
      {mode === "3d" && (
        <label className="mt-3 flex items-center justify-between text-sm">
          3D buildings
          <input type="checkbox" className="accent-primary" checked={settings.buildings3d} onChange={(e) => update({ buildings3d: e.target.checked })} />
        </label>
      )}
      {mode === "street" && (
        <p className="mt-3 text-xs text-muted-foreground">
          {env.mapillary ? "Tap an orange line to look around." : "Street imagery needs a Mapillary key. See Settings."}
        </p>
      )}
    </div>
  );
}
