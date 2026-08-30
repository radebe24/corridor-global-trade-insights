CREATE POLICY "sourcing_books_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sourcing-books' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "sourcing_books_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sourcing-books' AND auth.uid()::text = (storage.foldername(name))[1]);