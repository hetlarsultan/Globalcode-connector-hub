
-- 1) Friendships: prevent requester from self-accepting
DROP POLICY IF EXISTS "Users update own friendship rows" ON public.friendships;

CREATE POLICY "Addressee updates friendship status"
ON public.friendships FOR UPDATE TO authenticated
USING (auth.uid() = addressee_id)
WITH CHECK (auth.uid() = addressee_id);

CREATE POLICY "Requester can only keep pending"
ON public.friendships FOR UPDATE TO authenticated
USING (auth.uid() = requester_id AND status = 'pending'::friendship_status)
WITH CHECK (auth.uid() = requester_id AND status = 'pending'::friendship_status);

-- 2) user_bans: restrict visibility
DROP POLICY IF EXISTS "Authenticated can view bans" ON public.user_bans;

CREATE POLICY "Users view own ban or mods view all"
ON public.user_bans FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
);

-- 3) Storage: DELETE policies (folder-scoped owner)
CREATE POLICY "Users delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own chat images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-images' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 4) Storage: drop broad SELECT (listing) policies. Public URLs continue to work.
DROP POLICY IF EXISTS "Avatar images publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Chat images publicly readable" ON storage.objects;

-- 5) Functions: fix search_path
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

-- 6) Revoke direct EXECUTE on trigger-only / sensitive SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_banned_words() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;

-- 7) Realtime: restrict channel subscriptions
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users access own channels" ON realtime.messages;

CREATE POLICY "Authenticated users access own channels"
ON realtime.messages FOR SELECT TO authenticated
USING (
  -- Personal channels: invite-{uid}, call-{uid}, presence-{uid}
  realtime.topic() = ('invite-' || auth.uid()::text)
  OR realtime.topic() = ('call-' || auth.uid()::text)
  OR realtime.topic() = ('presence-' || auth.uid()::text)
  -- Pair channels: call-{uidA}-{uidB} where caller signals callee
  OR realtime.topic() LIKE ('call-' || auth.uid()::text || '-%')
  OR realtime.topic() LIKE ('call-%-' || auth.uid()::text)
  -- Room/public topics (rooms, messages, presence:rooms) — readable by signed-in users
  OR realtime.topic() LIKE 'room-%'
  OR realtime.topic() LIKE 'messages-%'
  OR realtime.topic() LIKE 'presence-rooms%'
  OR realtime.topic() = 'online-users'
  -- Private DM channels: dm-{uidA}-{uidB} with current user as one party
  OR realtime.topic() LIKE ('dm-' || auth.uid()::text || '-%')
  OR realtime.topic() LIKE ('dm-%-' || auth.uid()::text)
);
