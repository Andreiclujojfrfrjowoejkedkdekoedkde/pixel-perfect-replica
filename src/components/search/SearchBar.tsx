import { forwardRef, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Cog, Search, X } from "lucide-react";
import { useMapState } from "@/components/map/MapContext";
import { library } from "@/lib/library";
import { useSettings } from "@/lib/settings";
import { network } from "@/lib/platform";
import { ResultList, useSearchOrigin, useSearchSuggestions } from "./QuickSearch";
import type { Place } from "@/lib/services";

export const SearchBar = forwardRef<HTMLInputElement>(function SearchBar(_, ref) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const { map } = useMapState();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);
  const origin = useSearchOrigin();
  const { groups, flat, loading, offlineOnly } = useSearchSuggestions(q, origin);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const choose = (p: Place) => {
    library.addRecent(p);
    setOpen(false);
    setQ(p.name);
    map?.flyTo({ center: [p.lon, p.lat], zoom: Math.max(map.getZoom(), 15) });
    navigate({ to: "/map/place/$id", params: { id: p.id } });
  };

  return (
    <div ref={wrap} className="relative w-full">
      <div className="glass flex h-12 items-center gap-2 rounded-2xl px-3">
        <Search strokeWidth={1.5} className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          ref={ref}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setCursor(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, Math.max(0, flat.length - 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter" && flat[cursor]) choose(flat[cursor]);
            else if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder={
            offlineOnly ? "Search offline places" : "Search places, addresses, coordinates"
          }
          aria-label="Search"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        {q && (
          <button
            aria-label="Clear search"
            onClick={() => setQ("")}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X strokeWidth={1.5} className="h-5 w-5" />
          </button>
        )}
        <button
          aria-label="Settings"
          onClick={() => navigate({ to: "/settings" })}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Cog strokeWidth={1.5} className="h-5 w-5" />
        </button>
      </div>
      {open && q.trim() && (
        <div className="absolute left-0 right-0 top-14 z-40 overflow-hidden rounded-2xl border shadow-2xl">
          <ResultList
            groups={groups}
            flat={flat}
            cursor={cursor}
            onHover={setCursor}
            onPick={choose}
            highlight={q.trim()}
          />
          {!loading && !network.online() && (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">
              Offline: showing downloaded areas only.
            </p>
          )}
        </div>
      )}
    </div>
  );
});
