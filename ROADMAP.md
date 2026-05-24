# Gear Tracker App Product Roadmap (Practical, Ship-Ready)

## Current Top Gaps (highest impact)
1. Bike detail/deep analytics views are still thin (most insight is on dashboard cards).
2. Ride load model is heuristic and should be calibrated against real rider feedback.
3. Suspension workflow still needs clearer service-interval recommendations by riding style/terrain.
4. Background sync/retry visibility remains basic.
5. Lint/type cleanup (notably `any` usage) still pending.

## Phase 1 (shippable now)
- ✅ Landing and dashboard copy focused on suspension-first value.
- ✅ Replace dead-end UX with a working inline “Add bike” flow.
- ✅ Removed legacy import pipeline as out of scope for the product direction.
- ✅ Add env validation and operations/security docs.
- ✅ NextAuth + Prisma canonical auth schema (accounts/sessions/verification_tokens).
- ✅ Strava sync/disconnect APIs for first-party integration.
- ✅ OAuth callback/auth reliability fixes (including Strava `athlete` payload alignment).
- ✅ Production Docker flow with startup DB push and persistent SQLite volume.
- ✅ Dashboard cleanup: dark mode, KM/MI unit toggle, top-level tracked-bike metrics.
- ✅ Per-bike suspension Advanced toggle (rebound/compression) and baseline controls moved to bottom.

## Phase 2 (next 1-2 iterations)
- Build bike detail page (service history timeline + per-component status).
- Add explicit suspension components UI (fork/shock service tiers and reminders).
- Add mileage + time-based service due logic for suspension work.
- Improve ride-load scoring (power/suffer/effort inputs where available).
- Add Strava sync status + retry UI.

## Phase 3 (differentiation)
- Suspension service planner with terrain/style modifiers.
- Rider-specific interval tuning (aggressive/enduro/park usage presets).
- “Risk mode” indicator for overdue critical items.
- Exportable maintenance report for resale/service handoff.
