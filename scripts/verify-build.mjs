// Confirms the build produced what this template actually deploys, and says so
// out loud.
//
// Meridian is a TanStack Start app on Nitro's `cloudflare-module` preset, so it
// builds to a Cloudflare Worker with a static asset binding — NOT to a Vite
// `dist/client` folder. A deploy configured for `dist/client` fails with a
// confusing "directory does not exist" long after the build succeeded, so we
// check the real output here and print the directory to publish.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, ".output");
const serverEntry = join(output, "server", "index.mjs");
const publicDir = join(output, "public");
const workerConfig = join(output, "server", "wrangler.json");

const problems = [];

if (!existsSync(serverEntry)) problems.push("missing .output/server/index.mjs (the worker entry)");
if (!existsSync(publicDir)) problems.push("missing .output/public (the static assets)");
if (existsSync(publicDir) && !existsSync(join(publicDir, "sw.js"))) {
  problems.push("missing .output/public/sw.js (the service worker would not be cached)");
}
if (existsSync(publicDir) && !existsSync(join(publicDir, "index.html"))) {
  // Expected, not a problem: the HTML is rendered by the worker at request time.
  // Worth stating because it is the reason a static publish cannot work here.
}

if (problems.length) {
  console.error("\n[meridian] Build output is incomplete:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

let assetCount = 0;
try {
  assetCount = readFileSync(join(output, "nitro.json"), "utf8") ? 1 : 0;
} catch {
  /* nitro.json is informational only */
}
void assetCount;

const hasWorkerConfig = existsSync(workerConfig);

console.log("\n[meridian] Build OK.");
console.log("[meridian] This is a server-rendered Cloudflare Worker, not a static site:");
console.log(`[meridian]   worker entry : .output/server/index.mjs`);
console.log(`[meridian]   static assets: .output/public`);
console.log(
  `[meridian]   wrangler cfg : ${hasWorkerConfig ? ".output/server/wrangler.json" : "(none generated)"}`,
);
if (!existsSync(join(publicDir, "index.html"))) {
  console.log("[meridian] Note: there is no index.html because pages are rendered per request.");
  console.log("[meridian] Deploy the worker (or point the publish directory at .output).");
  console.log("[meridian] Publishing dist/client will not work for this app.");
}
console.log("");
