ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "download_link" text,
  ADD COLUMN IF NOT EXISTS "new_version_link" text;
