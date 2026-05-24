# Security & Configuration Notes

## Baseline controls
- Import endpoint is now admin-gated.
- Import payloads are validated before processing.
- Env vars are validated at startup via `src/env.ts`.

## Recommended operations policy
1. Set `ADMIN_EMAILS` in production (comma-separated list).
2. Rotate `NEXTAUTH_SECRET` for each environment.
3. Never commit `.env` files containing real secrets.
4. Restrict who can access `/import` at network or app routing level if possible.
5. Monitor import usage and keep a server log/audit trail.

## Environment variables
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `ADMIN_EMAILS` (optional, recommended in prod)
