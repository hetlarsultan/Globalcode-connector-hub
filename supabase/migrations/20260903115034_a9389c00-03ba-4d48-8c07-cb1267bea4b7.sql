CREATE TABLE public.ad_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_type text NOT NULL UNIQUE,
  label text NOT NULL,
  gross_value numeric NOT NULL DEFAULT 0,
  reward_rate numeric NOT NULL DEFAULT 0.25 CHECK (reward_rate >= 0 AND reward_rate <= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ad_placements TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ad_placements TO authenticated;
GRANT ALL ON public.ad_placements TO service_role;

ALTER TABLE public.ad_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read ad placements"
  ON public.ad_placements FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage ad placements"
  ON public.ad_placements FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER ad_placements_updated_at
  BEFORE UPDATE ON public.ad_placements
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.ad_reward_transactions ADD COLUMN IF NOT EXISTS ad_type text NOT NULL DEFAULT 'rewarded_video';

GRANT DELETE ON public.ad_reward_transactions TO authenticated;

CREATE POLICY "Admins view all ad rewards"
  ON public.ad_reward_transactions FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete ad rewards"
  ON public.ad_reward_transactions FOR DELETE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.ad_placements (ad_type, label, gross_value, reward_rate) VALUES
  ('rewarded_video', 'فيديو مكافئ', 0.0100, 0.25),
  ('rewarded_interstitial', 'إعلان بيني مكافئ', 0.0060, 0.25),
  ('offerwall', 'جدار العروض', 0.0200, 0.25)
ON CONFLICT (ad_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.credit_ad_reward(p_user_id uuid, p_transaction_id text, p_gross_value numeric, p_ad_network text DEFAULT 'internal'::text, p_ad_type text DEFAULT 'rewarded_video'::text)
 RETURNS TABLE(reward_value numeric, credited boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rate NUMERIC;
  v_gross NUMERIC;
  v_reward NUMERIC;
  v_id UUID;
BEGIN
  SELECT gross_value, reward_rate INTO v_gross, v_rate
    FROM public.ad_placements
   WHERE ad_type = p_ad_type AND is_active = true;

  IF v_rate IS NULL THEN
    v_rate := 0.25;
  END IF;
  -- the approved operation value configured by the app owner wins;
  -- fall back to the network-reported value when not configured.
  IF v_gross IS NULL OR v_gross = 0 THEN
    v_gross := COALESCE(p_gross_value, 0);
  END IF;

  v_reward := round(v_gross * v_rate, 4);

  INSERT INTO public.ad_reward_transactions
    (user_id, transaction_id, ad_network, ad_type, gross_value, reward_value, reward_rate,
     verification_status, credit_status, verified_at)
  VALUES (p_user_id, p_transaction_id, p_ad_network, p_ad_type, v_gross, v_reward, v_rate,
          'verified', 'pending', now())
  ON CONFLICT (transaction_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT v_reward, false;
    RETURN;
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (p_user_id, v_reward)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.wallets.balance + EXCLUDED.balance;

  UPDATE public.ad_reward_transactions
     SET credit_status = 'credited', credited_at = now()
   WHERE id = v_id;

  RETURN QUERY SELECT v_reward, true;
END;
$function$;