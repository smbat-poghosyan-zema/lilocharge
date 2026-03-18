-- Ensure TimescaleDB is available for hypertables and continuous aggregates.
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SessionStatus') THEN
    CREATE TYPE "SessionStatus" AS ENUM (
      'PENDING',
      'AUTHORIZED',
      'ACTIVE',
      'COMPLETED',
      'FAILED',
      'CANCELLED'
    );
  END IF;
END
$$;

-- Extend session lifecycle fields introduced in Step 6.
ALTER TABLE "sessions"
ADD COLUMN IF NOT EXISTS "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "start_time" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "end_time" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "energy_delivered" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "peak_power" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "total_cost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "transaction_id" TEXT,
ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS "sessions_status_idx"
ON "sessions" ("status");

CREATE INDEX IF NOT EXISTS "sessions_start_time_idx"
ON "sessions" ("start_time");

CREATE INDEX IF NOT EXISTS "sessions_created_at_idx"
ON "sessions" ("created_at");

-- High-frequency meter samples optimized as a TimescaleDB hypertable.
CREATE TABLE IF NOT EXISTS "meter_values" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL,
  "energy_active_import" DOUBLE PRECISION NOT NULL,
  "power_active_import" DOUBLE PRECISION NOT NULL,
  "current_import" DOUBLE PRECISION NOT NULL,
  "voltage" DOUBLE PRECISION NOT NULL,
  "soc" DOUBLE PRECISION,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "meter_values_pkey" PRIMARY KEY ("timestamp", "id"),
  CONSTRAINT "meter_values_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "meter_values_session_timestamp_key" UNIQUE ("session_id", "timestamp")
);

CREATE INDEX IF NOT EXISTS "meter_values_timestamp_idx"
ON "meter_values" ("timestamp");

CREATE INDEX IF NOT EXISTS "meter_values_session_timestamp_idx"
ON "meter_values" ("session_id", "timestamp");

SELECT create_hypertable(
  'meter_values',
  'timestamp',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE,
  migrate_data => TRUE
);

-- Minute-level aggregates for realtime dashboards.
CREATE MATERIALIZED VIEW IF NOT EXISTS "meter_values_1m"
WITH (timescaledb.continuous) AS
SELECT
  "session_id",
  time_bucket(INTERVAL '1 minute', "timestamp") AS "bucket",
  AVG("power_active_import") AS "avg_power_active_import",
  MAX("power_active_import") AS "max_power_active_import",
  MAX("energy_active_import") - MIN("energy_active_import") AS "energy_delta_wh",
  COUNT(*) AS "sample_count"
FROM "meter_values"
GROUP BY "session_id", "bucket"
WITH NO DATA;

CREATE INDEX IF NOT EXISTS "meter_values_1m_session_bucket_idx"
ON "meter_values_1m" ("session_id", "bucket");

-- Hour-level aggregates for reporting workloads.
CREATE MATERIALIZED VIEW IF NOT EXISTS "meter_values_1h"
WITH (timescaledb.continuous) AS
SELECT
  "session_id",
  time_bucket(INTERVAL '1 hour', "timestamp") AS "bucket",
  AVG("power_active_import") AS "avg_power_active_import",
  MAX("power_active_import") AS "max_power_active_import",
  MAX("energy_active_import") - MIN("energy_active_import") AS "energy_delta_wh",
  COUNT(*) AS "sample_count"
FROM "meter_values"
GROUP BY "session_id", "bucket"
WITH NO DATA;

CREATE INDEX IF NOT EXISTS "meter_values_1h_session_bucket_idx"
ON "meter_values_1h" ("session_id", "bucket");

SELECT add_continuous_aggregate_policy(
  'meter_values_1m',
  start_offset => INTERVAL '12 hours',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists => TRUE
);

SELECT add_continuous_aggregate_policy(
  'meter_values_1h',
  start_offset => INTERVAL '30 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

SELECT add_retention_policy(
  'meter_values',
  drop_after => INTERVAL '90 days',
  if_not_exists => TRUE
);

SELECT add_retention_policy(
  'meter_values_1m',
  drop_after => INTERVAL '365 days',
  if_not_exists => TRUE
);

SELECT add_retention_policy(
  'meter_values_1h',
  drop_after => INTERVAL '730 days',
  if_not_exists => TRUE
);
