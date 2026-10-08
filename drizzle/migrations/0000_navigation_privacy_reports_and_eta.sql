CREATE TABLE public.travel_preferences (user_id uuid PRIMARY KEY DEFAULT auth.uid(), history_opt_in boolean NOT NULL DEFAULT false, sync_opt_in boolean NOT NULL DEFAULT false, consent_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_preferences TO authenticated;
GRANT ALL ON public.travel_preferences TO service_role;
ALTER TABLE public.travel_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own travel preferences" ON public.travel_preferences TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.trip_summaries (id uuid PRIMARY KEY, user_id uuid NOT NULL DEFAULT auth.uid(), started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL, distance_m double precision NOT NULL DEFAULT 0, duration_s double precision NOT NULL DEFAULT 0, completed boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_summaries TO authenticated;
GRANT ALL ON public.trip_summaries TO service_role;
ALTER TABLE public.trip_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own unexpired trips" ON public.trip_summaries FOR SELECT TO authenticated USING (user_id = auth.uid() AND expires_at > now());
CREATE POLICY "Consent required to sync trips" ON public.trip_summaries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.travel_preferences p WHERE p.user_id = auth.uid() AND p.history_opt_in AND p.sync_opt_in));
CREATE POLICY "Delete own trips" ON public.trip_summaries FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX trip_summaries_user ON public.trip_summaries(user_id);

CREATE TABLE public.eta_shares (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(), token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')), eta timestamptz, remaining_s double precision NOT NULL DEFAULT 0, remaining_m double precision NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eta_shares TO authenticated;
GRANT ALL ON public.eta_shares TO service_role;
ALTER TABLE public.eta_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own ETA shares" ON public.eta_shares TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.read_shared_eta(share_token text) RETURNS TABLE(eta timestamptz, remaining_s double precision, remaining_m double precision, updated_at timestamptz, expires_at timestamptz) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT s.eta, s.remaining_s, s.remaining_m, s.updated_at, s.expires_at FROM public.eta_shares s WHERE s.token = share_token AND length(share_token) = 64 AND s.expires_at > now(); $$;
REVOKE ALL ON FUNCTION public.read_shared_eta(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_shared_eta(text) TO anon, authenticated;

CREATE TABLE public.road_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(), lat double precision NOT NULL, lon double precision NOT NULL, category text NOT NULL, description text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'), hidden boolean NOT NULL DEFAULT false);
GRANT SELECT, INSERT, DELETE ON public.road_reports TO authenticated;
GRANT ALL ON public.road_reports TO service_role;
ALTER TABLE public.road_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own reports" ON public.road_reports FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Create own reports" ON public.road_reports FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.travel_preferences p WHERE p.user_id = auth.uid()));
CREATE POLICY "Delete own reports" ON public.road_reports FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX road_reports_active ON public.road_reports(expires_at);
CREATE INDEX road_reports_user ON public.road_reports(user_id, created_at);

CREATE TABLE public.report_votes (report_id uuid NOT NULL REFERENCES public.road_reports(id) ON DELETE CASCADE, user_id uuid NOT NULL DEFAULT auth.uid(), kind text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(report_id, user_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_votes TO authenticated;
GRANT ALL ON public.report_votes TO service_role;
ALTER TABLE public.report_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own report votes" ON public.report_votes TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE OR REPLACE FUNCTION public.validate_road_report() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
IF NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not allowed'; END IF;
PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text));
IF (SELECT count(*) FROM public.road_reports WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour') >= 5 THEN RAISE EXCEPTION 'Report limit reached. Try again later.'; END IF;
IF NEW.lat NOT BETWEEN -90 AND 90 OR NEW.lon NOT BETWEEN -180 AND 180 OR length(NEW.description) > 500 OR NEW.category NOT IN ('police','accident','debris','pothole','flooding','ice_snow','stalled_vehicle','road_work','animal','other') THEN RAISE EXCEPTION 'Invalid report'; END IF;
NEW.created_at := now(); NEW.hidden := false; NEW.expires_at := now() + CASE WHEN NEW.category IN ('police','animal','stalled_vehicle') THEN interval '30 minutes' ELSE interval '2 hours' END;
RETURN NEW; END; $$;
CREATE TRIGGER validate_road_report BEFORE INSERT ON public.road_reports FOR EACH ROW EXECUTE FUNCTION public.validate_road_report();
CREATE OR REPLACE FUNCTION public.validate_report_vote() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
IF NEW.user_id IS DISTINCT FROM auth.uid() OR NEW.kind NOT IN ('confirm','gone','flag') THEN RAISE EXCEPTION 'Invalid confirmation'; END IF;
PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text));
IF NOT EXISTS (SELECT 1 FROM public.road_reports WHERE id = NEW.report_id AND expires_at > now() AND NOT hidden AND user_id <> auth.uid()) THEN RAISE EXCEPTION 'Report unavailable or your own report'; END IF;
IF (SELECT count(*) FROM public.report_votes WHERE user_id = NEW.user_id AND updated_at > now() - interval '1 hour') >= 30 THEN RAISE EXCEPTION 'Confirmation limit reached'; END IF;
NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER validate_report_vote BEFORE INSERT OR UPDATE ON public.report_votes FOR EACH ROW EXECUTE FUNCTION public.validate_report_vote();
CREATE OR REPLACE FUNCTION public.moderate_road_report() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
UPDATE public.road_reports SET hidden = true WHERE id = NEW.report_id AND (SELECT count(*) FROM public.report_votes WHERE report_id = NEW.report_id AND kind = 'flag') >= 3;
UPDATE public.road_reports SET expires_at = LEAST(expires_at, now()) WHERE id = NEW.report_id AND (SELECT count(*) FROM public.report_votes WHERE report_id = NEW.report_id AND kind = 'gone') >= 2;
RETURN NEW; END; $$;
CREATE TRIGGER moderate_road_report AFTER INSERT OR UPDATE ON public.report_votes FOR EACH ROW EXECUTE FUNCTION public.moderate_road_report();
CREATE OR REPLACE FUNCTION public.nearby_road_reports(west double precision, south double precision, east double precision, north double precision) RETURNS TABLE(id uuid, lat double precision, lon double precision, category text, description text, created_at timestamptz, expires_at timestamptz, confirmations bigint) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT r.id, r.lat, r.lon, r.category, r.description, r.created_at, r.expires_at, (SELECT count(*) FROM public.report_votes v WHERE v.report_id = r.id AND v.kind = 'confirm') FROM public.road_reports r WHERE NOT r.hidden AND r.expires_at > now() AND r.lon BETWEEN west AND east AND r.lat BETWEEN south AND north AND east - west BETWEEN 0 AND 2 AND north - south BETWEEN 0 AND 2 ORDER BY r.created_at DESC LIMIT 200; $$;
REVOKE ALL ON FUNCTION public.nearby_road_reports(double precision,double precision,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nearby_road_reports(double precision,double precision,double precision,double precision) TO anon, authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.road_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_summaries;

CREATE OR REPLACE FUNCTION public.validate_eta_share() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); IF TG_OP = 'INSERT' THEN NEW.expires_at := now() + interval '6 hours'; ELSE NEW.expires_at := OLD.expires_at; NEW.token := OLD.token; END IF; RETURN NEW; END; $$;
CREATE TRIGGER validate_eta_share BEFORE INSERT OR UPDATE ON public.eta_shares FOR EACH ROW EXECUTE FUNCTION public.validate_eta_share();
CREATE OR REPLACE FUNCTION public.validate_trip_summary() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.distance_m < 0 OR NEW.duration_s < 0 OR NEW.ended_at < NEW.started_at THEN RAISE EXCEPTION 'Invalid trip'; END IF; NEW.expires_at := now() + interval '30 days'; RETURN NEW; END; $$;
CREATE TRIGGER validate_trip_summary BEFORE INSERT ON public.trip_summaries FOR EACH ROW EXECUTE FUNCTION public.validate_trip_summary();