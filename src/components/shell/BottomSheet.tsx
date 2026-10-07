import { useEffect, useRef, useState, type ReactNode } from "react";

// Three snap points: peek, half, full. Spring-like easing on release.
const SNAPS = { peek: 0.16, half: 0.5, full: 0.92 };
type Snap = keyof typeof SNAPS;

export function BottomSheet({ children, snap: wanted, title }: { children: ReactNode; snap?: Snap; title?: string }) {
  const [snap, setSnap] = useState<Snap>(wanted ?? "peek");
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number; t: number } | null>(null);
  const [vh, setVh] = useState(800);

  useEffect(() => { setVh(window.innerHeight); const f = () => setVh(window.innerHeight); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  useEffect(() => { if (wanted) setSnap(wanted); }, [wanted]);

  const height = drag ?? SNAPS[snap] * vh;

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, h: height, t: performance.now() };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag(Math.min(vh * 0.95, Math.max(vh * 0.1, start.current.h + start.current.y - e.clientY)));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    const v = (start.current.y - e.clientY) / (performance.now() - start.current.t); // px/ms, + = up
    const projected = (drag ?? height) / vh + v * 0.25;
    const best = (Object.keys(SNAPS) as Snap[]).reduce((a, b) => (Math.abs(SNAPS[b] - projected) < Math.abs(SNAPS[a] - projected) ? b : a));
    setSnap(best);
    setDrag(null);
    start.current = null;
  };

  return (
    <section
      aria-label={title ?? "Panel"}
      className={`absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-3xl shadow-2xl ${drag == null ? "sheet-spring" : ""}`}
      style={{ height, paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="glass shrink-0 cursor-grab touch-none rounded-t-3xl pb-2 pt-2"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") setSnap(snap === "peek" ? "half" : "full");
          if (e.key === "ArrowDown") setSnap(snap === "full" ? "half" : "peek");
        }}
        role="slider"
        tabIndex={0}
        aria-label="Resize panel"
        aria-valuetext={snap}
        aria-valuenow={Math.round(SNAPS[snap] * 100)}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/50" />
      </div>
      <div className="surface min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}
