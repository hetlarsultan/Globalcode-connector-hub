DROP POLICY IF EXISTS "Authenticated users upload own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users upload own chat images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users update own chat images" ON storage.objects;

CREATE POLICY "Authenticated users upload own avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND split_part(name, '/', 1) = auth.uid()::text
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif)$'
);

CREATE POLICY "Authenticated users update own avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND split_part(name, '/', 1) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND split_part(name, '/', 1) = auth.uid()::text
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif)$'
);

CREATE POLICY "Authenticated users upload own chat images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-images'
  AND auth.uid() IS NOT NULL
  AND split_part(name, '/', 1) = auth.uid()::text
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif)$'
);

CREATE POLICY "Authenticated users update own chat images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND auth.uid() IS NOT NULL
  AND split_part(name, '/', 1) = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'chat-images'
  AND auth.uid() IS NOT NULL
  AND split_part(name, '/', 1) = auth.uid()::text
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|gif)$'
);