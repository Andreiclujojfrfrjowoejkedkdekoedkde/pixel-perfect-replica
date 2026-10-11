CREATE TABLE public.account_settings (
 user_id uuid PRIMARY KEY DEFAULT auth.uid(),
 enabled boolean NOT NULL DEFAULT false,
 preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT account_preferences_object CHECK (jsonb_typeof(preferences) = 'object' AND octet_length(preferences::text) <= 8192)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_settings TO authenticated;
GRANT ALL ON public.account_settings TO service_role;
ALTER TABLE public.account_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own account settings" ON public.account_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.patch_account_settings(p_patch jsonb, p_enabled boolean DEFAULT NULL)
RETURNS SETOF public.account_settings LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF jsonb_typeof(p_patch) <> 'object' OR octet_length(p_patch::text) > 8192 THEN RAISE EXCEPTION 'Invalid preferences'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) AS k(key) WHERE key NOT IN ('units','theme','timeFormat','defaultMode','buildings3d','labelScale','earthLabels','voice','volume','travelMode','avoidTolls','avoidHighways','avoidFerries','avoidUnpaved','speedTolerance','keepScreenOn','autoNight','leftHanded','vehicleType','evRangeKm','vehicleHeight','vehicleWeight','liveTraffic','trafficThickness')) THEN RAISE EXCEPTION 'Unsupported preference'; END IF;
 RETURN QUERY INSERT INTO public.account_settings AS a (user_id, enabled, preferences) VALUES (auth.uid(), coalesce(p_enabled,false), p_patch)
 ON CONFLICT (user_id) DO UPDATE SET enabled = coalesce(p_enabled,a.enabled), preferences = CASE WHEN coalesce(p_enabled,a.enabled) THEN a.preferences || p_patch ELSE a.preferences END, updated_at = now()
 RETURNING a.*;
END; $$;
REVOKE ALL ON FUNCTION public.patch_account_settings(jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patch_account_settings(jsonb,boolean) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.account_settings;