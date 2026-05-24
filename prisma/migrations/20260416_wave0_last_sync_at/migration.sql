-- Wave 0: add per-user Strava sync cooldown state
ALTER TABLE "users" ADD COLUMN "lastSyncAt" DATETIME;
