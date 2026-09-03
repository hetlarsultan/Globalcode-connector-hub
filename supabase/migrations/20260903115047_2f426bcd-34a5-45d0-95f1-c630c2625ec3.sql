REVOKE ALL ON FUNCTION public.credit_ad_reward(uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_ad_reward(uuid, text, numeric, text, text) TO service_role;
DROP FUNCTION IF EXISTS public.credit_ad_reward(uuid, text, numeric, text);