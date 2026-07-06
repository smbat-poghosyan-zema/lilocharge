-- Persist the charger's StartTransaction meter register (Wh) on the session so
-- StopTransaction can bill the authoritative meterStop - meterStart delta instead
-- of relying on sparse sampled meter values.
ALTER TABLE "sessions"
ADD COLUMN IF NOT EXISTS "meter_start" DOUBLE PRECISION;
