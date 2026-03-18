-- Enable trigram matching for fuzzy station name/address search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for tri-lingual station search fields.
CREATE INDEX IF NOT EXISTS "idx_stations_name_trgm"
ON "stations"
USING GIN (LOWER("name") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_stations_address_trgm"
ON "stations"
USING GIN (LOWER("address") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_stations_city_trgm"
ON "stations"
USING GIN (LOWER("city") gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_stations_operator_name_trgm"
ON "stations"
USING GIN (LOWER("operator_name") gin_trgm_ops);
