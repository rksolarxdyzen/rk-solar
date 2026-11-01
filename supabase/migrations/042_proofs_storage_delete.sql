-- Allow authenticated users to delete their company's objects in proofs
-- (needed when replacing quotation template images).

DROP POLICY IF EXISTS proofs_delete ON storage.objects;

CREATE POLICY proofs_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'proofs'
    AND (storage.foldername(name))[1] = auth_company_id()::text
  );
