# Strava Auth + Sync Operations

## What was added

- NextAuth-compatible Prisma models:
  - `Account`
  - `Session`
  - `VerificationToken`
- Secure Strava token lifecycle helpers (`src/server/strava.ts`)
- User-triggered sync endpoint: `POST /api/strava/sync`
- Disconnect endpoint: `POST /api/strava/disconnect`

## Required deployment step

Because auth models were added, update your DB schema:

```bash
npx prisma db push
```

Then rebuild/restart app container.

## Sync endpoint

`POST /api/strava/sync`

- Requires authenticated user session.
- Fetches latest activities from Strava.
- Refreshes token proactively if near expiry.
- Upserts activities idempotently by Strava activity ID.
- Recalculates bike mileage and maintenance flags.

## Disconnect endpoint

`POST /api/strava/disconnect`

- Removes linked Strava account records.
- Clears Strava tokens/IDs from user profile.
- Preserves historical activity records.
