CREATE TABLE public.payouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  method TEXT NOT NULL DEFAULT 'manual',
  account_details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payouts TO authenticated;
GRANT ALL ON public.payouts TO service_role;

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payouts" ON public.payouts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins view all payouts" ON public.payouts
  FOR SELECT TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update payouts" ON public.payouts
  FOR UPDATE TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER payouts_updated_at BEFORE UPDATE ON public.payouts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.request_payout(p_amount numeric, p_method text, p_account_details text)
RETURNS TABLE(payout_id uuid, new_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_balance NUMERIC;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF p_account_details IS NULL OR length(btrim(p_account_details)) < 3 THEN RAISE EXCEPTION 'invalid_account'; END IF;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE public.wallets SET balance = balance - p_amount WHERE user_id = v_uid
    RETURNING balance INTO v_balance;

  INSERT INTO public.payouts (user_id, amount, method, account_details)
  VALUES (v_uid, p_amount, COALESCE(NULLIF(btrim(p_method), ''), 'manual'), btrim(p_account_details))
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.request_payout(numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.settle_payout(p_payout_id uuid, p_status text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.payouts%ROWTYPE;
BEGIN
  IF NOT app_private.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_status NOT IN ('paid','rejected') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  SELECT * INTO v_row FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;

  IF p_status = 'rejected' THEN
    UPDATE public.wallets SET balance = balance + v_row.amount WHERE user_id = v_row.user_id;
  END IF;

  UPDATE public.payouts
     SET status = p_status, admin_note = p_note, processed_at = now()
   WHERE id = p_payout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_payout(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_payout(uuid, text, text) TO authenticated;

CREATE POLICY "Admins view all wallets" ON public.wallets
  FOR SELECT TO authenticated USING (app_private.has_role(auth.uid(), 'admin'::app_role));