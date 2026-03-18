-- Persist user notification preference flags for profile settings management.
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "push_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "marketing_notifications_enabled" BOOLEAN NOT NULL DEFAULT false;
