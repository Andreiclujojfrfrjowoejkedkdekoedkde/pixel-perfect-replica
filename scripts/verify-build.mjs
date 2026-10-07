// Confirms the build produced what Nitro says it produced, for any platform.
//
// Nitro picks its own output layout from the deploy target: cloudflare-module
// writes `.output`, netlify writes `.netlify/functions-internal` plus `dist`,
// and a Lovable build pins this with LOVABLE_NITRO_PRESET. Hard-coding one
// layout here broke a Netlify deploy, so this reads Nitro's own manifest
// instead of guessing, and only fails when the build genuinely produced nothing.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();

/** Where Nitro leaves its manifest, per preset. */
const MANIFESTS = [
  ".output/nitro.json",
  ".netlify/functions-internal/nitro.json",
  ".vercel/output/nitro.json",
];

const found = MANIFESTS.map((p) => join(root, p)).filter((p) => existsSync(p));

if (!found.length) {
  console.error("[meridian] No Nitro build output found.");
  console.error(`[meridian] Looked for: ${MANIFESTS.join(", ")}`);
  console.error("[meridian] The build did not run to completion.");
  process.exit(1);
}

let manifest;
let manifestPath = found[0];
for (const path of found) {
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
    manifestPath = path;
    break;
  } catch {
    /* try the next candidate */
  }
}

if (!manifest) {
  console.error("[meridian] Nitro manifest exists but could not be read.");
  process.exit(1);
}

const base = dirname(manifestPath);
const preset = manifest.preset || "unknown";
const serverEntry = manifest.serverEntry ? resolve(base, manifest.serverEntry) : null;
const publicDir = manifest.publicDir ? resolve(base, manifest.publicDir) : null;

const missing = [];
if (!serverEntry || !existsSync(serverEntry)) {
  missing.push(`server entry not found (expected ${serverEntry ?? "unknown"})`);
}
if (!publicDir || !existsSync(publicDir)) {
  missing.push(`static assets not found (expected ${publicDir ?? "unknown"})`);
}

if (missing.length) {
  console.error("[meridian] Build output is incomplete:");
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

const rel = (p) => p.replace(`${root}/`, "").replace(`${root}\\`, "");
const hasIndexHtml = existsSync(join(publicDir, "index.html"));
const hasServiceWorker = existsSync(join(publicDir, "sw.js"));

console.log("");
console.log("[meridian] Build OK.");
console.log(`[meridian]   nitro preset  : ${preset}`);
console.log(`[meridian]   server entry : ${rel(serverEntry)}`);
console.log(`[meridian]   static assets: ${rel(publicDir)}`);

if (preset === "netlify") {
  console.log(`[meridian] Deploy settings: command "bun run build", publish "${rel(publicDir)}"`);
} else if (preset === "cloudflare-module") {
  console.log('[meridian] Deploy settings: deploy the Cloudflare Worker from ".output"');
} else {
  console.log(`[meridian] Deploy settings: publish "${rel(publicDir)}"`);
}

// Pages are rendered per request, so no index.html is emitted for SSR presets.
// That is expected, and it is why the publish directory alone is not enough:
// the serverless function has to be deployed too.
if (!hasIndexHtml) {
  console.log(
    "[meridian] Note: no index.html, because pages are rendered per request by the server.",
  );
  console.log("[meridian] This app needs its server output deployed, not just static files.");
}
if (!hasServiceWorker) {
  console.log("[meridian] Warning: sw.js is missing, the offline app shell will not install.");
}
console.log("");
