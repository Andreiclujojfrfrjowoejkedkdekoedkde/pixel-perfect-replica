import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Map, Navigation, Download, SlidersHorizontal, Settings, Home, BriefcaseBusiness, Pencil, ArrowRight, UserRound, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SearchBar } from "@/components/search/SearchBar";
import { storage } from "@/lib/platform";
import type { Place } from "@/lib/services";
import { useAccount } from "@/lib/account";

type Shortcuts = { home?: Place; work?: Place };

export function HomeScreen() {
  const [shortcuts, setShortcuts] = useState<Shortcuts>({});
  const [editing, setEditing] = useState<"home" | "work" | null>(null);
  const navigate = useNavigate();
  const { user, ready } = useAccount();
  const [infoOpen, setInfoOpen] = useState(false);
  useEffect(() => { setShortcuts(storage.get("shortcuts", {})); }, []);
  const save = (place: Place) => {
    if (!editing) return;
    const next = { ...shortcuts, [editing]: place };
    storage.set("shortcuts", next); setShortcuts(next); setEditing(null);
  };
  const go = (key: "home" | "work") => {
    const p = shortcuts[key];
    if (!p) { setEditing(key); return; }
    navigate({ to: "/directions", search: { to: `${p.lat},${p.lon}`, toName: p.name } });
  };
  return <div className="homepage fixed inset-0 z-40 flex items-center justify-center overflow-y-auto">
    <div className="homepage-map-wash pointer-events-none absolute inset-0" aria-hidden="true" />
    <div className="homepage-content relative z-10 flex w-full max-w-4xl flex-col gap-8 px-5 py-10 sm:gap-10 sm:px-8 sm:py-12">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:justify-between">
        <div className="min-w-0"><h1 className="font-display text-5xl leading-tight">Meridian</h1><p className="mt-2 text-[10px] font-semibold uppercase text-muted-foreground">A living atlas of the world</p></div>
        <div className="homepage-account flex shrink-0 items-center gap-2"><Button asChild variant="ghost" className="glass h-10 gap-2 rounded-lg px-3 text-xs" disabled={!ready}><Link to="/auth" aria-label={user ? "My account" : "Log in / Sign up"} title={user ? "My account" : "Log in / Sign up"}><UserRound strokeWidth={1.5} className="h-4 w-4" /><span>{user ? "My account" : "Log in / Sign up"}</span></Link></Button><Button asChild variant="ghost" size="icon" className="glass h-10 w-10 rounded-lg" title="Preferences"><Link to="/settings" search={{ from: "home" }} aria-label="Preferences"><Settings strokeWidth={1.5} className="h-4 w-4" /></Link></Button></div>
      </header>
      <div className="relative z-20"><SearchBar home /></div>
      <nav aria-label="Main actions" className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
        <Button asChild variant="ghost" className="homepage-action glass"><Link to="/map"><Map strokeWidth={1.5} /><span className="font-display text-xl">Open map</span><span className="text-xs text-muted-foreground">Browse anywhere</span></Link></Button>
        <Button asChild className="homepage-action homepage-primary"><Link to="/directions"><Navigation strokeWidth={1.5} /><span className="font-display text-xl">Directions</span><span className="text-xs opacity-80">Plan a trip</span></Link></Button>
        <Button asChild variant="ghost" className="homepage-action glass"><Link to="/offline"><Download strokeWidth={1.5} /><span className="font-display text-xl">Offline</span><span className="text-xs text-muted-foreground">Download areas</span></Link></Button>
        <Button asChild variant="ghost" className="homepage-action glass"><Link to="/settings" search={{ from: "home" }}><SlidersHorizontal strokeWidth={1.5} /><span className="font-display text-xl">Preferences</span><span className="text-xs text-muted-foreground">Tune Meridian</span></Link></Button>
      </nav>
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between"><h2 className="text-[10px] font-semibold uppercase text-muted-foreground">Shortcuts</h2><Button variant="ghost" size="sm" className="h-6 text-xs text-primary" onClick={() => setEditing("home")}>Edit <ArrowRight strokeWidth={1.5} className="h-3 w-3" /></Button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["home", "work"] as const).map(key => { const Icon = key === "home" ? Home : BriefcaseBusiness; const place = shortcuts[key]; return <div key={key} className="glass flex min-w-0 items-center gap-3 rounded-xl p-3 sm:p-4">
            <Button variant="ghost" onClick={() => go(key)} className="h-auto min-w-0 flex-1 justify-start gap-4 px-1 py-1 text-left"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-secondary/60"><Icon strokeWidth={1.5} className="h-5 w-5 text-muted-foreground" /></span><span className="min-w-0"><span className="block text-sm font-semibold">{key === "home" ? "Take me home" : "Take me to work"}</span><span className="block truncate text-[11px] text-muted-foreground">{place?.name ?? "Set an address"}</span></span></Button>
            <Button variant="ghost" size="icon" onClick={() => setEditing(key)} aria-label={`Edit ${key} address`} title={`Edit ${key} address`} className="shrink-0 text-muted-foreground"><Pencil strokeWidth={1.5} className="h-4 w-4" /></Button>
          </div>; })}
        </div>
      </section>
      <footer className="homepage-attribution mt-4 flex items-center justify-center gap-2 text-center text-[10px] leading-relaxed text-muted-foreground"><span className="hidden sm:inline">Map data © OpenStreetMap contributors. Routing by Valhalla. Search by Photon.</span><Button variant="ghost" size="icon" className="glass h-8 w-8 rounded-full" aria-label="Map information" title="Map information" onClick={() => setInfoOpen(true)}><Info strokeWidth={1.5} className="h-4 w-4" /></Button></footer>
    </div>
    <Dialog open={infoOpen} onOpenChange={setInfoOpen}><DialogContent className="glass"><DialogTitle>Map information</DialogTitle><p className="text-sm">Made by <a href="https://www.andreihedes.com" className="text-primary underline underline-offset-4">Andrei Hedes</a> <span aria-label="with love">❤️</span></p><DialogDescription>Map data © OpenStreetMap contributors. Tiles by OpenFreeMap. Live traffic © TomTom, where available on the map. Routing by Valhalla. Search by Photon (komoot).</DialogDescription></DialogContent></Dialog>
    <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}><DialogContent className="max-w-[calc(100vw-32px)] sm:max-w-lg"><DialogTitle>Set {editing} address</DialogTitle><DialogDescription>Search for your {editing} address.</DialogDescription><SearchBar key={editing} onChoose={save} />{editing && shortcuts[editing] && <Button variant="ghost" className="text-destructive" onClick={() => { if (!editing) return; const next = { ...shortcuts }; delete next[editing]; storage.set("shortcuts", next); setShortcuts(next); setEditing(null); }}>Remove address</Button>}</DialogContent></Dialog>
  </div>;
}