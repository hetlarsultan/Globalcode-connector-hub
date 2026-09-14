ALTER TABLE public.ad_reward_transactions REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_reward_transactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;