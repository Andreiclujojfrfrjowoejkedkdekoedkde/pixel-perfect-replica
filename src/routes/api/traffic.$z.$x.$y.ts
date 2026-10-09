import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/traffic/$z/$x/$y")({ server: { handlers: { GET: async ({ params, request }) => {
  const z=Number(params.z), x=Number(params.x), y=Number(params.y);
  if (![z,x,y].every(Number.isInteger) || z<5 || z>18 || x<0 || y<0 || x>=2**z || y>=2**z) return new Response("Invalid tile", { status: 400 });
  const thickness = Number(new URL(request.url).searchParams.get("thickness") ?? 10);
  if (!Number.isInteger(thickness) || thickness < 1 || thickness > 20) return new Response("Invalid traffic size", { status: 400 });
  const key=process.env['TOMTOM_API_KEY']; if (!key) return new Response("Traffic not connected", { status: 503 });
  try { const response=await fetch(`https://api.tomtom.com/traffic/map/4/tile/flow/relative/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}&tileSize=256&thickness=${thickness}`, { signal: AbortSignal.timeout(8000) }); if (!response.ok) return new Response("Traffic temporarily unavailable", { status: 503 }); return new Response(response.body, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=60" } }); }
  catch { return new Response("Traffic temporarily unavailable", { status: 503 }); }
} } } });