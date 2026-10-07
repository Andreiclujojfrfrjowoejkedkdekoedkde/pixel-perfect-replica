# Meridian

A living atlas of the world: search, turn-by-turn navigation, posted speed limits,
offline maps and AI-categorised road hazards.

Built with [Lovable](https://lovable.dev).

## Deploying

**Meridian is a server-rendered app, not a static site.** It must ship both its
static assets _and_ its server output, because pages are rendered per request and
the hazard-classification endpoint is a server function.

The Nitro target is pinned in `vite.config.ts` so the output layout does not
depend on which machine runs the build. It defaults to `netlify`:

| Output                                        | What it is                                                           |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `dist/`                                       | static assets: hashed JS/CSS, icons, `sw.js`, `manifest.webmanifest` |
| `.netlify/functions-internal/server/main.mjs` | the function that renders every page                                 |

Deploy settings (also in `netlify.toml`):

- **Build command:** `bun run build`
- **Publish directory:** `dist`

To deploy to Cloudflare Workers instead, build with
`MERIDIAN_NITRO_PRESET=cloudflare-module bun run build`. That layout puts the
worker entry in `.output/server/index.mjs` with assets bound from
`.output/public`, and the deploy target is the worker rather than a static
directory.

Two things to know:

- **Do not publish `dist/client`.** That is the default for a plain Vite SPA and
  this project is not one. There is no `dist/client` and no `index.html`, because
  pages are rendered per request.
- **Dropping SSR is not an option.** The hazard server function and the Supabase
  auth middleware both run server-side; publishing only the client assets would
  break them silently.

`bun run build` ends with `scripts/verify-build.mjs`, which reads Nitro's own
manifest, checks the output it declared actually exists, prints the correct
publish directory for the preset in use, and fails loudly if the build is
incomplete. It works for every preset rather than assuming one layout.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

`npm test` runs the unit tests, `npm run lint` runs ESLint.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f9289ea5-2e1c-449b-bbe9-2309226b8a06).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.
