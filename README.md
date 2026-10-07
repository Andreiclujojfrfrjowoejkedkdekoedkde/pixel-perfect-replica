# Meridian

A living atlas of the world: search, turn-by-turn navigation, posted speed limits,
offline maps and AI-categorised road hazards.

Built with [Lovable](https://lovable.dev).

## Deploying

**Meridian is a server-rendered Cloudflare Worker, not a static site.**

`npm run build` (Nitro, `cloudflare-module` preset) produces:

| Path                           | What it is                                            |
| ------------------------------ | ----------------------------------------------------- |
| `.output/server/index.mjs`     | the worker entry that renders every page              |
| `.output/public`               | hashed JS/CSS, icons, `sw.js`, `manifest.webmanifest` |
| `.output/server/wrangler.json` | worker + static asset binding config                  |

Deploy settings that work:

- **Build command:** `bun run build` (or `npm run build`)
- **Publish directory:** `.output`

Two things to know:

- **Do not publish `dist/client`.** That is the default for a plain Vite SPA and
  this project is not one. There is no `dist/` directory and no `index.html`,
  because pages are rendered per request by the worker. A static publish will
  either fail outright or serve a site with no HTML.
- **SSR cannot be dropped.** The hazard-classification endpoint is a server
  function, and the Supabase auth middleware runs server-side. Publishing only
  the client assets would silently break both.

`npm run build` ends with a check that prints these paths and fails loudly if the
build output is incomplete, so a misconfigured publish directory is obvious from
the build log alone.

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
