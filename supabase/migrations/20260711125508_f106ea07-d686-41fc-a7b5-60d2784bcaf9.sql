
-- Self-destructing images: clear image_url after first view by a non-sender

CREATE OR REPLACE FUNCTION public.consume_message_image(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.messages
     SET image_url = NULL
   WHERE id = p_id
     AND image_url IS NOT NULL
     AND user_id <> auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.consume_pm_image(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.private_messages
     SET image_url = NULL
   WHERE id = p_id
     AND image_url IS NOT NULL
     AND sender_id <> auth.uid()
     AND recipient_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.consume_message_image(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_pm_image(uuid) TO authenticated;

-- Ensure UPDATE payloads carry full row so clients receive the cleared image_url
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.private_messages REPLICA IDENTITY FULL;
