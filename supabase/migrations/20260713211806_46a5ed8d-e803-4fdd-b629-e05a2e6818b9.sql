
-- Loosen chat-images upload policy: keep per-user folder isolation, but drop the strict extension regex which can fail on unusual filenames/casings and cause "row violates RLS" for authenticated users.
DROP POLICY IF EXISTS "Users upload chat images" ON storage.objects;
DROP POLICY IF EXISTS "Users update own chat images" ON storage.objects;

CREATE POLICY "Users upload chat images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users update own chat images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'chat-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'chat-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
