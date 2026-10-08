import { storage } from "./platform";

export type TripSummary = { id: string; started_at: string; ended_at: string; distance_m: number; duration_s: number; completed: boolean };
const RETENTION = 30 * 86400000;
export function readTrips(): TripSummary[] {
  const trips = storage.get<TripSummary[]>("trips", []).filter(t => Date.parse(t.ended_at) > Date.now() - RETENTION);
  storage.set("trips", trips);
  return trips;
}
export function saveTrip(trip: TripSummary) { mergeTrips([trip]); }
export function mergeTrips(incoming: TripSummary[]) {
  const existing = readTrips();
  const next = [...new Map([...existing, ...incoming].map(t => [t.id, { id:t.id, started_at:t.started_at, ended_at:t.ended_at, distance_m:t.distance_m, duration_s:t.duration_s, completed:t.completed }])).values()].filter(t => Date.parse(t.ended_at) > Date.now() - RETENTION).sort((a,b) => b.ended_at.localeCompare(a.ended_at)).slice(0, 500);
  storage.set("trips", next);
  if (JSON.stringify(existing) !== JSON.stringify(next)) window.dispatchEvent(new Event("meridian-trips"));
}
export function clearTrips() { storage.set("trips", []); window.dispatchEvent(new Event("meridian-trips")); }