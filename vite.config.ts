// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Pin the Nitro target so the output layout does not depend on which machine or
  // host happens to run the build. This project is server-rendered, and the
  // OpenRouter hazard endpoint is a server function, so SSR cannot be dropped.
  //
  // netlify  -> static assets in dist/, serverless function in .netlify/functions-internal
  // cloudflare-module -> worker entry in .output/server, assets bound from .output/public
  //
  // Swap to "cloudflare-module" if you deploy to Cloudflare Workers instead; then the
  // publish target is the worker, not a static directory. `bun run build` prints which
  // layout it produced.
  nitro: { preset: process.env["MERIDIAN_NITRO_PRESET"] || "netlify" },
});
