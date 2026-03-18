-- Stores user favorite stations for quick-access lists and toggles.
CREATE TABLE IF NOT EXISTS "favorite_stations" (
  "user_id" UUID NOT NULL,
  "station_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "favorite_stations_pkey" PRIMARY KEY ("user_id", "station_id"),
  CONSTRAINT "favorite_stations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "favorite_stations_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "favorite_stations_station_id_idx" ON "favorite_stations" ("station_id");
CREATE INDEX IF NOT EXISTS "favorite_stations_created_at_idx" ON "favorite_stations" ("created_at");
