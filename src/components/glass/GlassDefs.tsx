import { useEffect, useState } from "react";

/** Builds an edge-weighted displacement map: neutral grey in the middle,
 *  strong push at the rims so the bend concentrates at the glass edge. */
let displacementMap: string | null = null;
function makeDisplacementMap(size = 256) {
  if (displacementMap) return displacementMap;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const rim = 0.18;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / (size - 1), v = y / (size - 1);
      const dx = u < rim ? -(1 - u / rim) : u > 1 - rim ? (u - (1 - rim)) / rim : 0;
      const dy = v < rim ? -(1 - v / rim) : v > 1 - rim ? (v - (1 - rim)) / rim : 0;
      const i = (y * size + x) * 4;
      img.data[i] = 128 + Math.sign(dx) * dx * dx * 127;
      img.data[i + 1] = 128 + Math.sign(dy) * dy * dy * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  displacementMap = c.toDataURL();
  return displacementMap;
}

export function GlassDefs() {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
    const ua = navigator.userAgent;
    // backdrop-filter: url() renders only in Chromium; Safari and Firefox get the blur fallback.
    const chromium = /Chrome\/|Chromium\/|Edg\//.test(ua) && !/Firefox\//.test(ua);
    if (!reduce && chromium && CSS.supports("backdrop-filter", "url(#a)")) {
      setHref(makeDisplacementMap());
      document.documentElement.classList.add("refract");
    }

    // Highlight follows pointer on desktop, tilt on mobile.
    const root = document.documentElement.style;
    // Root custom properties restyle the whole document, so write them only
    // when the rounded value changes, and never while a pointer is pressed
    // (map drags, text selection, button presses) or the tab is hidden.
    let frame = 0;
    let latest: [string, string, string] | null = null;
    const applied: [string, string, string] = ["", "", ""];
    const keys = ["--gx", "--gy", "--gtilt"] as const;
    const schedule = (x: string, y: string, tilt: string) => {
      latest = [x, y, tilt];
      if (frame || document.hidden) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!latest) return;
        for (let i = 0; i < 3; i++) {
          if (applied[i] !== latest[i]) { applied[i] = latest[i]!; root.setProperty(keys[i]!, latest[i]!); }
        }
      });
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons !== 0 || e.pointerType === "touch") return;
      const fx = e.clientX / innerWidth, fy = e.clientY / innerHeight;
      schedule(`${Math.round(fx * 50) * 2}%`, `${Math.round(fy * 50) * 2}%`, `${Math.round((fx - 0.5) * 20) * 2}deg`);
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      schedule(`${50 + e.gamma}%`, `${Math.max(0, e.beta - 30)}%`, `${e.gamma}deg`);
    };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("deviceorientation", onTilt, { passive: true });
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, []);

  if (!href) return null;
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
      <filter id="meridian-lens" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feImage href={href} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
        {/* Per-channel displacement gives a faint chromatic fringe at the rim. */}
        <feDisplacementMap in="SourceGraphic" in2="map" scale="34" xChannelSelector="R" yChannelSelector="G" result="dR" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="30" xChannelSelector="R" yChannelSelector="G" result="dG" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="26" xChannelSelector="R" yChannelSelector="G" result="dB" />
        <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
        <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
        <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
        <feBlend in="r" in2="g" mode="screen" result="rg" />
        <feBlend in="rg" in2="b" mode="screen" />
      </filter>
    </svg>
  );
}
