-- Add PostGIS geography column for WGS84 coordinates.
ALTER TABLE "stations"
ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

-- Backfill existing rows from latitude/longitude.
UPDATE "stations"
SET "location" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
WHERE "location" IS NULL;

-- Spatial index for fast ST_DWithin proximity queries.
CREATE INDEX IF NOT EXISTS "idx_stations_location"
ON "stations"
USING GIST ("location");

-- Keep location synchronized whenever latitude/longitude change.
CREATE OR REPLACE FUNCTION update_station_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_station_location" ON "stations";

CREATE TRIGGER "trg_update_station_location"
BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "stations"
FOR EACH ROW
EXECUTE FUNCTION update_station_location();
