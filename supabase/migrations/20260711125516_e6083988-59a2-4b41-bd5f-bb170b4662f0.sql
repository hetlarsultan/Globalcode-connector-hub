
REVOKE ALL ON FUNCTION public.consume_message_image(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_pm_image(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_message_image(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_pm_image(uuid) TO authenticated;
