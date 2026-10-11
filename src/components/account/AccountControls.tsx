import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bookmark, Pencil, Trash2, Check, X, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { library, useLibrary } from "@/lib/library";
import { useSettings } from "@/lib/settings";
import { usePreferenceSync } from "@/lib/preference-sync";
import type { Place } from "@/lib/services";

function SavedPlace({ place }: { place: Place }) {
  const [editing, setEditing] = useState(false); const [name, setName] = useState(place.name);
  return <div className="flex min-w-0 items-center gap-2 border-b py-3">
    <Bookmark className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} />
    {editing ? <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={e => { e.preventDefault(); library.renameSaved(place.id, name); setEditing(false); }}><input autoFocus aria-label="Saved place name" maxLength={120} value={name} onChange={e => setName(e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border bg-card/40 px-2 text-sm" /><Button type="submit" variant="ghost" size="icon" title="Save name" aria-label="Save name" disabled={!name.trim()}><Check strokeWidth={1.5} className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" title="Cancel rename" aria-label="Cancel rename" onClick={() => setEditing(false)}><X strokeWidth={1.5} className="h-4 w-4" /></Button></form> : <><Link to="/place/$id" params={{ id: place.id }} className="min-w-0 flex-1 text-sm"><span className="block truncate">{place.name}</span><span className="block truncate text-xs text-muted-foreground">{place.subtitle || place.kind}</span></Link><Button variant="ghost" size="icon" title={`Rename ${place.name}`} aria-label={`Rename ${place.name}`} onClick={() => { setName(place.name); setEditing(true); }}><Pencil className="h-4 w-4" strokeWidth={1.5} /></Button><Button variant="ghost" size="icon" title={`Remove ${place.name}`} aria-label={`Remove ${place.name}`} onClick={() => library.removeSaved(place.id)}><Trash2 className="h-4 w-4" strokeWidth={1.5} /></Button></>}
  </div>;
}
export function AccountControls() {
  const { saved, recent } = useLibrary(); const { settings: s, update } = useSettings();
  const { enabled, status, setEnabled } = usePreferenceSync(); const [busy, setBusy] = useState(false);
  return <>
    <section className="menu-section space-y-4 border-t py-5"><h2 className="font-display text-xl">Across my devices</h2>
      <div className="flex items-center justify-between gap-4 text-sm"><label htmlFor="preference-sync">Sync travel & map preferences</label><Switch id="preference-sync" checked={enabled} disabled={busy} onCheckedChange={async on => { setBusy(true); await setEnabled(on); setBusy(false); }} /></div>
      <p role="status" className="text-xs text-muted-foreground">{status}</p>
      <p className="text-xs text-muted-foreground">Vehicle, route, voice and display choices. Search history, saved locations, privacy consent and GPS data stay separate.</p>
    </section>
    <section className="menu-section space-y-4 border-t py-5"><h2 className="font-display text-xl">My vehicle</h2>
      <Select value={s.vehicleType} onValueChange={v => { if (v === "car" || v === "ev" || v === "van" || v === "truck") update({ vehicleType: v }); }}><SelectTrigger aria-label="Vehicle profile" className="glass"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="car">Car</SelectItem><SelectItem value="ev">Electric car</SelectItem><SelectItem value="van">Van</SelectItem><SelectItem value="truck">Truck</SelectItem></SelectContent></Select>
      {s.vehicleType === "ev" && <label className="flex items-center justify-between gap-3 text-sm">Range (km)<input aria-label="Full-charge range" type="number" min={50} max={1000} value={s.evRangeKm} onChange={e => update({ evRangeKm: Math.max(50, Math.min(1000, Number(e.target.value) || 50)) })} className="w-24 rounded-md border bg-card/40 p-2" /></label>}
      {(s.vehicleType === "truck" || s.vehicleType === "van") && <><label className="flex items-center justify-between gap-3 text-sm">Height (metres)<input aria-label="Vehicle height" type="number" min={1} max={6} step={0.1} value={s.vehicleHeight} onChange={e => update({ vehicleHeight: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })} className="w-24 rounded-md border bg-card/40 p-2" /></label><label className="flex items-center justify-between gap-3 text-sm">Weight (tonnes)<input aria-label="Vehicle weight" type="number" min={0.5} max={80} step={0.5} value={s.vehicleWeight} onChange={e => update({ vehicleWeight: Math.max(0.5, Math.min(80, Number(e.target.value) || 0.5)) })} className="w-24 rounded-md border bg-card/40 p-2" /></label></>}
      {(["avoidTolls", "avoidHighways", "avoidFerries", "avoidUnpaved"] as const).map(k => <div key={k} className="flex items-center justify-between text-sm"><label htmlFor={`account-${k}`}>{({ avoidTolls: "Avoid tolls", avoidHighways: "Avoid highways", avoidFerries: "Avoid ferries", avoidUnpaved: "Avoid unpaved roads" })[k]}</label><Switch id={`account-${k}`} checked={s[k]} onCheckedChange={v => update({ [k]: v })} /></div>)}
      <Button asChild variant="outline"><Link to="/settings">All preferences</Link></Button>
    </section>
    <section className="menu-section border-t py-5"><div className="flex items-center justify-between"><h2 className="font-display text-xl">Saved locations</h2><span className="tnum text-xs text-muted-foreground">{saved.length}</span></div><p className="mt-2 text-xs text-muted-foreground">Stored on this device.</p>{saved.length ? saved.map(place => <SavedPlace key={place.id} place={place} />) : <p className="py-4 text-sm text-muted-foreground">No saved locations.</p>}<Button asChild variant="ghost" className="mt-3"><Link to="/map"><MapPin className="h-4 w-4" strokeWidth={1.5} />Open map</Link></Button></section>
    <section className="menu-section flex flex-wrap gap-2 border-t py-5"><Button asChild variant="outline"><Link to="/history">Trips & stats</Link></Button><Button variant="ghost" disabled={!recent.length} onClick={() => library.clearRecent()}>Clear recent searches</Button></section>
  </>;
}