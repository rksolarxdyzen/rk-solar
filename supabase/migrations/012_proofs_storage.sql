-- RK Solar — proofs storage bucket (install / ticket photos)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'proofs',
  'proofs',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS proofs_upload ON storage.objects;
DROP POLICY IF EXISTS proofs_update ON storage.objects;
DROP POLICY IF EXISTS proofs_select ON storage.objects;
DROP POLICY IF EXISTS proofs_public_read ON storage.objects;

-- Authenticated company users can upload under {company_id}/...
CREATE POLICY proofs_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'proofs'
    AND (storage.foldername(name))[1] = auth_company_id()::text
  );

CREATE POLICY proofs_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'proofs'
    AND (storage.foldername(name))[1] = auth_company_id()::text
  );

CREATE POLICY proofs_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'proofs'
    AND (storage.foldername(name))[1] = auth_company_id()::text
  );

-- Public read (public bucket) — allow anon select for proof URLs
CREATE POLICY proofs_public_read ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'proofs');
