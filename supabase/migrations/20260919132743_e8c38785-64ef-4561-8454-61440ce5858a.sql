CREATE TABLE public.ad_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_type TEXT NOT NULL DEFAULT 'rewarded_video',
  ad_unit_id TEXT,
  ad_network TEXT NOT NULL DEFAULT 'admob',
  transaction_id TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ad_views TO authenticated;
GRANT ALL ON public.ad_views TO service_role;

ALTER TABLE public.ad_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own ad views" ON public.ad_views
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view own ad views" ON public.ad_views
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users update own ad views" ON public.ad_views
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all ad views" ON public.ad_views
  FOR SELECT TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX ad_views_user_created_idx ON public.ad_views (user_id, created_at DESC);

CREATE TRIGGER ad_views_updated_at BEFORE UPDATE ON public.ad_views
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();