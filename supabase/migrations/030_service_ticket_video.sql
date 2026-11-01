-- ============================================================
-- 030_service_ticket_video.sql
-- Allow short service-ticket videos in the existing proofs bucket.
-- Duration is validated in the browser and by the server action for portal
-- uploads (maximum 59 seconds).
-- ============================================================

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ],
  -- Staff videos upload directly to Storage; keep the bucket at the existing 10 MB limit.
  file_size_limit = 10485760
WHERE id = 'proofs';
