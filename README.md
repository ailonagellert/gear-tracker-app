# Gear Tracker App

Gear Tracker App is a bike maintenance and suspension tracking app that syncs ride and gear data from Strava.

> Bike maintenance and suspension tracking powered by your ride history.

## Why this exists

Most ride apps know how far your bike has gone, but they do not help you manage real maintenance work: suspension service dates, component intervals, baseline resets, and per-bike service history. Gear Tracker App focuses on turning ride history into actionable bike maintenance records.

## Features

- **Strava integration**: OAuth sign-in, connect/disconnect, activity sync, and linked bike gear IDs.
- **Bike maintenance records**: Track components, maintenance intervals, last-service baselines, and service history.
- **Suspension-first workflow**: Fork/shock settings, last service date, service provider notes, and suspension tracking toggles.
- **Dashboard metrics**: Tracked bike count, total distance, recent distance, since-maintenance distance, due items, and ride load.
- **Type-safe full stack**: Next.js 15, TypeScript, tRPC, Prisma, SQLite, NextAuth, Tailwind CSS.
- **Self-hostable**: Docker Compose setup with persistent SQLite storage.

## Strava branding note

This project integrates with Strava but is not affiliated with, endorsed by, or sponsored by Strava. The app name intentionally avoids using “Strava” as part of the product identity.

## Tech stack

- **Framework**: Next.js 15 App Router
- **Language**: TypeScript
- **API**: tRPC
- **Auth**: NextAuth with Strava OAuth
- **Database**: SQLite with Prisma ORM
- **UI**: Tailwind CSS and shadcn/ui-style components
- **Deployment**: Docker / Docker Compose

## Getting started

### Prerequisites

- Node.js `>=20.19 <21`
- npm
- Strava API credentials from <https://www.strava.com/settings/api>

### Environment setup

```bash
cp .env.example .env.local
```

Then update `.env.local`:

```bash
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="replace-with-long-random-secret"
NEXTAUTH_URL="http://localhost:3000"
STRAVA_CLIENT_ID="replace-with-strava-client-id"
STRAVA_CLIENT_SECRET="replace-with-strava-client-secret"
STRAVA_SYNC_COOLDOWN_MINUTES="5"
ADMIN_EMAILS="admin@example.com"
```

For production Docker deployments, use:

```bash
DATABASE_URL="file:/app/data/dev.db"
NEXTAUTH_URL="https://your-domain.example"
```

### Development

```bash
npm install
npm run generate
npx prisma migrate dev
npm run dev
```

Open <http://localhost:3000>.

### Production with Docker

```bash
docker compose up -d --build
```

The default Compose file runs the app on `http://localhost:3002` and stores SQLite data in the `gear_tracker_app_data` volume.

For an isolated local preview instance on port `3005`:

```bash
docker compose -f docker-compose.preview.yml up -d --build
```

## Project structure

```text
src/
├── app/                 # Next.js App Router pages
├── components/          # React components
│   ├── mobile/          # Mobile-first dashboard sections
│   └── ui/              # Shared UI primitives
├── lib/                 # Utility libraries and recommendation logic
├── pages/api/           # NextAuth, Strava sync/disconnect, health endpoints
├── server/              # tRPC routers, auth, Prisma, Strava helpers
└── utils/               # Client API utilities

prisma/
├── schema.prisma        # Database schema
└── migrations/          # Production migrations
```

## Useful commands

```bash
npm run dev             # Start dev server
npm run build           # Build production app
npm run start           # Start production server
npm run generate        # Generate Prisma client
npm run migrate         # Run Prisma migrate dev
npm run seed            # Seed local database
```

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md) for current product direction and delivery phases.

## Security

See [`SECURITY.md`](./SECURITY.md) and [`STRAVA-AUTH-SYNC.md`](./STRAVA-AUTH-SYNC.md) for auth/sync operational notes.

## License

MIT
