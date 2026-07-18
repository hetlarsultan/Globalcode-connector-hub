DROP POLICY IF EXISTS "Authenticated users read own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users read own chat images" ON storage.objects;

CREATE POLICY "Authenticated users read own avatars"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND split_part(name, '/', 1) = auth.uid()::text
);

CREATE POLICY "Authenticated users read own chat images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND auth.uid() IS NOT NULL
  AND split_part(name, '/', 1) = auth.uid()::text
);