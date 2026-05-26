-- Hardening PR: add sync lock expiry and indexes for hot bike/date relation paths used in sync, dashboard, and queries.

ALTER TABLE "users" ADD COLUMN "syncLockExpiresAt" DATETIME;

CREATE INDEX "Bike_userId_idx" ON "bikes" ("userId");
CREATE INDEX "Activity_userId_startDate_idx" ON "activities" ("userId", "startDate");
CREATE INDEX "Activity_bikeId_startDate_idx" ON "activities" ("bikeId", "startDate");
CREATE INDEX "Component_bikeId_idx" ON "components" ("bikeId");
CREATE INDEX "MaintenanceRecord_userId_performedAt_idx" ON "maintenance_records" ("userId", "performedAt");
CREATE INDEX "MaintenanceRecord_bikeId_performedAt_idx" ON "maintenance_records" ("bikeId", "performedAt");
