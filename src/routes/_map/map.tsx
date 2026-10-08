import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_map/map")({
  head: () => ({ meta: [
    { title: "Explore the map — Meridian" },
    { name: "description", content: "Explore real places and roads with Meridian’s interactive world atlas." },
    { property: "og:title", content: "Explore the world with Meridian" },
    { property: "og:description", content: "Find nearby places and browse the interactive world map." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => null,
});