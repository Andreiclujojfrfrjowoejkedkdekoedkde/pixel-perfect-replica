import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_map/")({
  head: () => ({
    meta: [
      { title: "Meridian — a living atlas of the world" },
      { name: "description", content: "Search places, get directions and explore the world on a map that reads like a printed atlas." },
      { property: "og:title", content: "Meridian — a living atlas of the world" },
      { property: "og:description", content: "Search places, get directions and explore the world in 2D, 3D, satellite and street view." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // The map shell renders the home panel itself.
  component: () => null,
});
