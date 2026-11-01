-- Remove 10 MB ceiling on the proofs bucket so install photos/videos
-- are not rejected by storage after the app stopped enforcing MB caps.
-- Duration limits for videos remain in application code.

UPDATE storage.buckets
SET file_size_limit = NULL
WHERE id = 'proofs';
