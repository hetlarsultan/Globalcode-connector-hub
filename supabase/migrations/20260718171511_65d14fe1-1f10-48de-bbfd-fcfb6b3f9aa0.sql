REVOKE EXECUTE ON FUNCTION public.check_banned_words() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_age() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_age() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_pm_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_pm_read(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_pm_thread_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_pm_thread_read(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.consume_pm_image(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_pm_image(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.consume_message_image(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_message_image(uuid) TO authenticated;