
-- 1. chat-images: restrict INSERT to safe image extensions (server-side MIME check)
DROP POLICY IF EXISTS "Users upload chat images" ON storage.objects;
CREATE POLICY "Users upload chat images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND lower(regexp_replace(name, '^.*\.', '')) IN ('jpg','jpeg','png','gif','webp','heic','heif')
  );

-- 2. chat-images: explicit owner-only UPDATE policy (also enforces safe extension)
DROP POLICY IF EXISTS "Users update own chat images" ON storage.objects;
CREATE POLICY "Users update own chat images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-images' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (
    bucket_id = 'chat-images'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND lower(regexp_replace(name, '^.*\.', '')) IN ('jpg','jpeg','png','gif','webp','heic','heif')
  );

-- Also tighten avatars INSERT/UPDATE to safe extensions
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND lower(regexp_replace(name, '^.*\.', '')) IN ('jpg','jpeg','png','gif','webp','heic','heif')
  );
DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (
    bucket_id = 'avatars'
    AND (auth.uid())::text = (storage.foldername(name))[1]
    AND lower(regexp_replace(name, '^.*\.', '')) IN ('jpg','jpeg','png','gif','webp','heic','heif')
  );

-- 3. private_messages: remove tampering-prone recipient UPDATE policy; add RPCs
DROP POLICY IF EXISTS "Recipients mark as read" ON public.private_messages;

CREATE OR REPLACE FUNCTION public.mark_pm_read(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.private_messages
     SET is_read = true
   WHERE id = p_id AND recipient_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.mark_pm_thread_read(p_sender uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.private_messages
     SET is_read = true
   WHERE sender_id = p_sender AND recipient_id = auth.uid() AND is_read = false;
$$;

REVOKE ALL ON FUNCTION public.mark_pm_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_pm_thread_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_pm_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pm_thread_read(uuid) TO authenticated;

-- 4. friendships: remove requester UPDATE (they can DELETE to cancel)
DROP POLICY IF EXISTS "Requester can only keep pending" ON public.friendships;

-- 5. profiles: hide 'age' column from other authenticated users via column-level GRANTs
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, username, display_name, avatar_url, bio, gender,
  is_online, last_seen, created_at, updated_at,
  name_color, text_color, font_family
) ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO service_role;

-- Owner-only RPC to fetch own age
CREATE OR REPLACE FUNCTION public.get_my_age()
RETURNS smallint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT age FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_age() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_age() TO authenticated;

-- 6. Move SECURITY DEFINER role helpers out of the exposed public schema
CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION app_private.get_user_role(_user_id uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 WHEN 'member' THEN 3 ELSE 4 END
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app_private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.get_user_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION app_private.get_user_role(uuid) TO authenticated, anon;

-- Recreate all policies that referenced public.has_role to use app_private.has_role
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins/mods can manage rooms" ON public.rooms;
CREATE POLICY "Admins/mods can manage rooms" ON public.rooms FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'moderator'::public.app_role)
  );

DROP POLICY IF EXISTS "Users delete own or mods delete any" ON public.messages;
CREATE POLICY "Users delete own or mods delete any" ON public.messages FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'moderator'::public.app_role)
  );

DROP POLICY IF EXISTS "Mods manage bans" ON public.user_bans;
CREATE POLICY "Mods manage bans" ON public.user_bans FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'moderator'::public.app_role)
  );

DROP POLICY IF EXISTS "Users view own ban or mods view all" ON public.user_bans;
CREATE POLICY "Users view own ban or mods view all" ON public.user_bans FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'moderator'::public.app_role)
  );

DROP POLICY IF EXISTS "Admins/mods manage banned words" ON public.banned_words;
CREATE POLICY "Admins/mods manage banned words" ON public.banned_words FOR ALL TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'moderator'::public.app_role)
  );

-- Drop the previously exposed public function versions
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.get_user_role(uuid);
