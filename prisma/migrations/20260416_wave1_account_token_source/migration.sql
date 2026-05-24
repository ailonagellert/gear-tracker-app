-- Backfill Strava OAuth token fields into accounts before removing legacy user columns.
UPDATE "accounts"
SET
  "access_token" = COALESCE(
    "access_token",
    (SELECT "stravaAccessToken" FROM "users" WHERE "users"."id" = "accounts"."userId")
  ),
  "refresh_token" = COALESCE(
    "refresh_token",
    (SELECT "stravaRefreshToken" FROM "users" WHERE "users"."id" = "accounts"."userId")
  ),
  "expires_at" = COALESCE(
    "expires_at",
    CAST(strftime('%s', (SELECT "stravaTokenExpiry" FROM "users" WHERE "users"."id" = "accounts"."userId")) AS INTEGER)
  )
WHERE "provider" = 'strava';

ALTER TABLE "users" DROP COLUMN "stravaAccessToken";
ALTER TABLE "users" DROP COLUMN "stravaRefreshToken";
ALTER TABLE "users" DROP COLUMN "stravaTokenExpiry";
