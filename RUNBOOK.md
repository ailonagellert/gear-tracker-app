# Gear Tracker App Runbook

## Local development

```bash
cp .env.example .env.local
npm install
npm run generate
npx prisma migrate dev
npm run dev
```

Open <http://localhost:3000>.

## Required runtime environment

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_SYNC_COOLDOWN_MINUTES`
- `ADMIN_EMAILS` for admin-only operations

## Docker deployment

```bash
docker compose up -d --build
```

The default Compose service:

- exposes the app on host port `3002`
- stores SQLite data at `/app/data/dev.db` in the `gear_tracker_app_data` volume
- runs `prisma migrate deploy` before starting Next.js
- exposes a healthcheck at `/api/health`

## Isolated preview deployment

```bash
docker compose -f docker-compose.preview.yml up -d --build
```

The preview Compose service:

- exposes the app on host port `3005`
- stores SQLite data in the `gear_tracker_preview_data` volume
- uses the same `.env.local` file

## Auth + Prisma gotchas

- NextAuth requires Prisma tables: `accounts`, `sessions`, and `verification_tokens`.
- `User.email` is optional because the OAuth provider may not return email.
- OAuth access and refresh tokens are stored in the NextAuth `Account` table.

## Ride sync behavior

`POST /api/strava/sync`:

- requires an authenticated session
- refreshes tokens if needed
- upserts activities idempotently
- auto-creates bikes from linked gear IDs
- applies friendly bike names from gear details
- recalculates bike mileage and maintenance flags
- enforces the configured per-user sync cooldown
