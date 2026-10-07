import { useEffect, useRef } from "react";

/**
 * Slow liquid backdrop for the home screen.
 *
 * Deliberately restrained: three very large, very soft shapes drifting at
 * different speeds over a warm paper gradient, with a faint sheen that sweeps
 * across. Everything sits on its own compositor layer and is skipped entirely
 * when the user asks for reduced motion, so it costs nothing to look at and
 * nothing to scroll past.
 */
export function LiquidBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // Drive the drift from one shared clock so the layers stay in phase.
      const t = (now - start) / 1000;
      el.style.setProperty("--drift", t.toFixed(2));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Warm base so the glass panels always have something to refract. */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 liquid-base" />

      <div ref={ref} className="absolute inset-0">
        <span className="liquid-blob liquid-a" />
        <span className="liquid-blob liquid-b" />
        <span className="liquid-blob liquid-c" />
      </div>

      {/* A slow diagonal sheen, like light moving across still water. */}
      <div className="liquid-sheen" />

      {/* Fine grain stops the big gradients banding on cheap panels. */}
      <div
        className="absolute inset-0 opacity-[0.03] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Vignette so panel text always wins over the motion behind it. */}
      <div className="absolute inset-0 liquid-vignette" />
    </div>
  );
}
