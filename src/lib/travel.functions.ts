import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const eta = z.object({ eta: z.string().datetime().nullable(), remaining_s: z.number().finite().min(0).max(604800), remaining_m: z.number().finite().min(0).max(50000000) });
export const createEtaShare = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(eta).handler(async ({ data, context }) => {
  const { data: prefs } = await context.supabase.from("travel_preferences").select("user_id").eq("user_id", context.userId).maybeSingle();
  if (!prefs) throw new Error("Choose your privacy preferences in Account first.");
  const { count } = await context.supabase.from("eta_shares").select("id", { count: "exact", head: true }).eq("user_id", context.userId).gt("expires_at", new Date().toISOString());
  if ((count ?? 0) >= 5) throw new Error("Stop an existing share before creating another.");
  const result = await context.supabase.from("eta_shares").insert({ ...data, user_id: context.userId }).select("id, token, expires_at").single();
  if (result.error) throw new Error("Could not start sharing. Please retry.");
  return result.data;
});
export const updateEtaShare = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(eta.extend({ id: z.string().uuid() })).handler(async ({ data, context }) => {
  const { id, ...values } = data;
  const result = await context.supabase.from("eta_shares").update(values).eq("id", id).eq("user_id", context.userId).gt("expires_at", new Date().toISOString());
  if (result.error) throw new Error("Sharing is disconnected.");
  return { ok: true };
});
export const stopEtaShare = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid() })).handler(async ({ data, context }) => {
  const result = await context.supabase.from("eta_shares").delete().eq("id", data.id).eq("user_id", context.userId);
  if (result.error) throw new Error("Could not stop sharing. Retry while connected.");
  return { ok: true };
});
export const postRoadReport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180), category: z.enum(["police","accident","debris","pothole","flooding","ice_snow","stalled_vehicle","road_work","animal","other"]), description: z.string().trim().max(500) })).handler(async ({ data, context }) => {
  const result = await context.supabase.from("road_reports").insert({ ...data, user_id: context.userId });
  if (result.error) throw new Error(result.error.message.includes("limit") ? "Report limit reached. Try again in an hour." : "Could not post. Choose your account privacy preferences, then retry.");
  return { ok: true };
});
export const voteRoadReport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ report_id: z.string().uuid(), kind: z.enum(["confirm","gone","flag"]) })).handler(async ({ data, context }) => {
  const result = await context.supabase.from("report_votes").upsert({ ...data, user_id: context.userId });
  if (result.error) throw new Error("Unable to confirm: report expired, yours, or confirmation limit reached.");
  return { ok: true };
});
export const deleteTravelData = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const result = await context.supabase.rpc("delete_own_travel_data");
  if (result.error) throw new Error("Deletion could not finish. Retry while connected.");
  return { ok: true };
});
export const trafficTile = createServerFn({ method: "GET" }).handler(async () => ({ available: Boolean(process.env['TOMTOM_API_KEY']) }));