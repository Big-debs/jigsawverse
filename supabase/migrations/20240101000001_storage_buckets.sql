-- =====================================================
-- STORAGE BUCKETS AND POLICIES
-- File: supabase/migrations/20240101000001_storage_buckets.sql
-- =====================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('puzzle-images', 'puzzle-images', true),
  ('avatars', 'avatars', true);

-- =====================================================
-- PUZZLE IMAGES BUCKET POLICIES
-- =====================================================

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload puzzle images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'puzzle-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own images
CREATE POLICY "Users can update own puzzle images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'puzzle-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own images
CREATE POLICY "Users can delete own puzzle images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'puzzle-images' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow everyone to view public images
CREATE POLICY "Anyone can view puzzle images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'puzzle-images');

-- =====================================================
-- AVATARS BUCKET POLICIES
-- =====================================================

-- Allow authenticated users to upload avatars
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to update their own avatars
CREATE POLICY "Users can update own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own avatars
CREATE POLICY "Users can delete own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow everyone to view avatars
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');