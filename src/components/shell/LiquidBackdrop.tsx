import { useEffect, useRef } from "react";

/**
 * Slow drifting liquid gradient used behind the home screen. Deliberately cheap:
 * a few large blurred blobs on their own compositor layer, so it costs nothing
 * while scrolling and disappears entirely when the user asks for less motion.
 */
export function LiquidBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let t = 0;
    const loop = () => {
      t += 0.004;
      el.style.setProperty("--t", t.toFixed(4));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
    >
      <div ref={ref} className="absolute inset-0 opacity-90">
        <span className="liquid-blob liquid-a" />
        <span className="liquid-blob liquid-b" />
        <span className="liquid-blob liquid-c" />
        <span className="liquid-blob liquid-d" />
      </div>
      {/* Fine grain stops the big gradients from banding on cheap panels. */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background/70" />
    </div>
  );
}
