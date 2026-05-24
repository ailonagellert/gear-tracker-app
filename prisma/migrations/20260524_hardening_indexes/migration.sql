-- Hardening PR: add indexes for hot user/bike/date relation paths used in sync, dashboard, and queries.
-- SQLite compatible; uses IF NOT EXISTS for safety.

CREATE INDEX IF NOT EXISTS "User_lastSyncAt_idx" ON "users" ("lastSyncAt");
CREATE INDEX IF NOT EXISTS "Bike_userId_idx" ON "bikes" ("userId");
CREATE INDEX IF NOT EXISTS "Activity_userId_startDate_idx" ON "activities" ("userId", "startDate");
CREATE INDEX IF NOT EXISTS "Activity_bikeId_startDate_idx" ON "activities" ("bikeId", "startDate");
CREATE INDEX IF NOT EXISTS "Component_bikeId_idx" ON "components" ("bikeId");
CREATE INDEX IF NOT EXISTS "MaintenanceRecord_userId_performedAt_idx" ON "maintenance_records" ("userId", "performedAt");
CREATE INDEX IF NOT EXISTS "MaintenanceRecord_bikeId_performedAt_idx" ON "maintenance_records" ("bikeId", "performedAt");
