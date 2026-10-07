import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Navigation, Bookmark, BookmarkCheck, Share2, Phone, Globe, Clock, MapPin, X, Download } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { placeDetails } from "@/lib/services";
import { useLibrary, library } from "@/lib/library";
import { formatOpeningHours } from "@/lib/format";

export const Route = createFileRoute("/_map/place/$id")({
  head: () => ({
    meta: [
      { title: "Place — Meridian" },
      { name: "description", content: "Address, opening hours and directions for this place on Meridian." },
      { property: "og:title", content: "A place on Meridian" },
      { property: "og:description", content: "Open this place on Meridian for details and directions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlacePage,
});

function PlacePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { map, setMarkers } = useMapState();
  const { saved } = useLibrary();
  const [copied, setCopied] = useState(false);
  const { data: p, error, isLoading } = useQuery({ queryKey: ["place", id], queryFn: () => placeDetails(id), staleTime: 3600_000 });

  useEffect(() => {
    if (!p) return;
    setMarkers([p]);
    map?.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 16), padding: innerWidth < 768 ? { top: 0, left: 0, right: 0, bottom: innerHeight * 0.5 } : 0 });
    return () => setMarkers([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, map]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading place</div>;
  if (error || !p) return <div className="p-6 text-sm text-muted-foreground">{(error as Error)?.message ?? "Place not found."}</div>;

  const isSaved = saved.some((s) => s.id === p.id);
  const share = async () => {
    const url = location.href;
    if (navigator.share) await navigator.share({ title: p.name, url }).catch(() => {});
    else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
  };

  const action = "flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-xs hover:bg-secondary";

  return (
    <article className="pb-8">
      <header className="flex items-start gap-3 px-5 pt-5">
        <div className="min-w-0 flex-1">
          <div className="smallcaps text-xs text-primary">{p.kind}</div>
          <h1 className="font-display text-2xl leading-tight">{p.name}</h1>
        </div>
        <button onClick={() => navigate({ to: "/" })} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X strokeWidth={1.5} /></button>
      </header>
      <div className="mt-4 flex gap-1 px-3">
        <Link to="/directions" search={{ to: `${p.lat},${p.lon}`, toName: p.name }} className={`${action} text-primary`}>
          <Navigation strokeWidth={1.5} className="h-5 w-5" /> Directions
        </Link>
        <button onClick={() => library.toggleSave(p)} className={action} aria-pressed={isSaved}>
          {isSaved ? <BookmarkCheck strokeWidth={1.5} className="h-5 w-5 text-primary" /> : <Bookmark strokeWidth={1.5} className="h-5 w-5" />} {isSaved ? "Saved" : "Save"}
        </button>
        <button onClick={share} className={action}><Share2 strokeWidth={1.5} className="h-5 w-5" /> {copied ? "Copied" : "Share"}</button>
        <Link to="/offline" search={{ lat: p.lat, lon: p.lon }} className={action}><Download strokeWidth={1.5} className="h-5 w-5" /> Download</Link>
      </div>
      <div className="hairline mx-5 mt-4" />
      <dl className="space-y-4 px-5 pt-4 text-sm">
        <div className="flex gap-3"><MapPin strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><dd>{p.address}</dd></div>
        {p.openingHours && (
          <div className="flex gap-3">
            <Clock strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <dd className="tnum space-y-0.5">{formatOpeningHours(p.openingHours).map((l) => <div key={l}>{l}</div>)}</dd>
          </div>
        )}
        {p.phone && <div className="flex gap-3"><Phone strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><dd><a className="text-primary underline-offset-2 hover:underline" href={`tel:${p.phone}`}>{p.phone}</a></dd></div>}
        {p.website && <div className="flex gap-3"><Globe strokeWidth={1.5} className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><dd className="min-w-0 truncate"><a className="text-primary underline-offset-2 hover:underline" href={p.website} target="_blank" rel="noreferrer">{p.website.replace(/^https?:\/\//, "")}</a></dd></div>}
        <div className="tnum text-xs text-muted-foreground">{p.lat.toFixed(5)}, {p.lon.toFixed(5)}</div>
      </dl>
    </article>
  );
}
