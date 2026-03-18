-- Stores per-device FCM tokens for user-targeted push notifications.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PushTokenPlatform') THEN
    CREATE TYPE "PushTokenPlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "user_push_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "platform" "PushTokenPlatform" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "user_push_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_push_tokens_token_key" UNIQUE ("token")
);

CREATE INDEX IF NOT EXISTS "user_push_tokens_user_id_idx" ON "user_push_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "user_push_tokens_is_active_idx" ON "user_push_tokens" ("is_active");
