-- Wallet
CREATE TABLE public.wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC(14,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own wallet" ON public.wallets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER wallets_updated_at BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Ad reward transactions
CREATE TABLE public.ad_reward_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL UNIQUE,
  ad_network TEXT NOT NULL DEFAULT 'internal',
  gross_value NUMERIC(14,4) NOT NULL DEFAULT 0,
  reward_value NUMERIC(14,4) NOT NULL DEFAULT 0,
  reward_rate NUMERIC(5,4) NOT NULL DEFAULT 0.25,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  credit_status TEXT NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ,
  credited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ad_reward_tx_user_idx ON public.ad_reward_transactions(user_id, created_at DESC);

-- user may read only own rows; gross_value stays hidden from clients
GRANT SELECT (id, user_id, transaction_id, reward_value, verification_status, credit_status, verified_at, credited_at, created_at, updated_at)
  ON public.ad_reward_transactions TO authenticated;
GRANT ALL ON public.ad_reward_transactions TO service_role;

ALTER TABLE public.ad_reward_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ad rewards" ON public.ad_reward_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER ad_reward_tx_updated_at BEFORE UPDATE ON public.ad_reward_transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Server-side credit routine (idempotent per transaction_id)
CREATE OR REPLACE FUNCTION public.credit_ad_reward(
  p_user_id UUID,
  p_transaction_id TEXT,
  p_gross_value NUMERIC,
  p_ad_network TEXT DEFAULT 'internal'
)
RETURNS TABLE (reward_value NUMERIC, credited BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate NUMERIC := 0.25;
  v_reward NUMERIC := round(COALESCE(p_gross_value,0) * 0.25, 4);
  v_id UUID;
BEGIN
  INSERT INTO public.ad_reward_transactions
    (user_id, transaction_id, ad_network, gross_value, reward_value, reward_rate,
     verification_status, credit_status, verified_at)
  VALUES (p_user_id, p_transaction_id, p_ad_network, COALESCE(p_gross_value,0), v_reward, v_rate,
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
$$;

REVOKE ALL ON FUNCTION public.credit_ad_reward(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_ad_reward(UUID, TEXT, NUMERIC, TEXT) TO service_role;