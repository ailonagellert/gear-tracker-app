# Gear Expansion Plan

## Objective
Evolve Gear Tracker App into a ride-synced **Gear Tracker** that supports bikes, shoes, and other trackable gear while preserving current bike maintenance depth.

## Product Goals
1. Expand addressable audience beyond cyclists.
2. Keep existing bike users stable (no breaking UX/data loss).
3. Introduce a clean, scalable UI for mixed gear types.
4. Improve first-session activation via onboarding setup.

---

## Scope (MVP)
- Gear types: `BIKE`, `SHOES`, `OTHER`
- Strava-linked gear + manual gear
- Tracking filters by activity type
- Per-gear maintenance/replacement rules
- First-login onboarding wizard
- Unified recommendations feed

Out of scope (later):
- Payments/subscriptions
- Team/shared accounts
- Complex ML recommendations

---

## Architecture Strategy

### 1) Data model refactor (backward-compatible)
Add a generalized `Gear` core model, keep bike-specific depth in related tables.

#### Proposed schema additions
- `Gear`
  - `id`
  - `userId`
  - `name`
  - `gearType` (`BIKE` | `SHOES` | `OTHER`)
  - `stravaGearId` (nullable, unique per user)
  - `isTracking` (boolean)
  - `trackingRules` (JSON or typed columns)
  - `replacementIntervalKm` (nullable)
  - `replacementIntervalDays` (nullable)
  - `totalMileageKm`
  - `lastUsedAt`
  - timestamps

- `UserTrackingPreferences`
  - `userId` (unique)
  - `trackRide`
  - `trackRun`
  - `trackTrailRun`
  - `trackVirtual`
  - `trackOther`
  - `onboardingCompletedAt`

- Optional bike-specialization relation
  - `BikeProfile` linked 1:1 to `Gear` where `gearType=BIKE`
  - Existing suspension/component tables can reference `BikeProfile` or `Gear` with constraints.

#### Migration approach
- Keep existing `Bike` data intact initially.
- Introduce `Gear` and dual-write where needed.
- Backfill `Gear` from existing bikes.
- Switch reads to `Gear` abstraction.
- Remove old direct assumptions in later cleanup migration.

### 2) Domain layer
Introduce service layer abstraction:
- `gearService`
  - `listGear(userId, filters)`
  - `createGear(...)`
  - `updateGearRules(...)`
  - `toggleTracking(...)`
  - `applyRecommendationAction(...)`

This prevents UI/API from hardcoding bike-only logic.

---

## API Plan (tRPC)

### New/updated routers
- `gear.getAll`
- `gear.getById`
- `gear.create`
- `gear.update`
- `gear.toggleTracking`
- `gear.setRules`
- `gear.delete` (soft-delete recommended)
- `onboarding.getStatus`
- `onboarding.savePreferences`
- `onboarding.complete`

### Existing bike router
- Keep operational during transition.
- Mark as legacy and migrate usage screen-by-screen.

---

## Strava Sync Plan

### Current behavior
Sync centers on bike gear IDs.

### New behavior
1. Pull activities.
2. Apply user activity-type filters.
3. Resolve linked gear from Strava `gear_id` (if present).
4. Upsert into `Gear` model.
5. Aggregate mileage by gear and update maintenance/replacement state.
6. Preserve behavior when activity has no gear (`Unassigned` handling).

### Edge cases
- Same user has multiple shoes or bikes with similar names.
- Activities missing `gear_id`.
- Gear renamed on Strava.

---

## Recommendation Engine Plan

Unify recommendations into a single feed:
- `MAINTENANCE_DUE` (bike components/suspension)
- `REPLACEMENT_DUE` (shoes/other gear)
- `CHECK_SOON` (warning window)
- `SNOOZED`

### Rules (MVP)
- Bikes: keep existing scoring + due logic.
- Shoes: replacement based on mileage + optional age cap.
- Other: interval-only basic logic.

---

## UI/UX Plan

### Information architecture
- Top nav: `Dashboard`, `Gear`, `Maintenance`, `Settings`

### Dashboard
- KPI cards:
  - Active gear count
  - Due now
  - Due soon
  - Distance (30d)
- Priority section: “Needs attention”
- Keep visuals concise and action-focused.

### Gear page
- Filter chips: `All`, `Bikes`, `Shoes`, `Other`
- Card/list toggle
- Clean per-type cards:
  - Bikes: distance, due components, suspension status
  - Shoes: distance since replacement, threshold, estimated remaining
  - Other: interval status

### Maintenance page
- Unified recommendations list
- Bulk actions later

### Settings
- Activity tracking preferences
- Units (MI/KM)
- Notification prefs

---

## First-Login Onboarding Wizard

### Trigger
- User authenticated AND `onboardingCompletedAt` is null.

### Steps
1. **Goal selection**
   - Maintenance, replacement, or both
2. **Activity types to track**
   - Ride, Run, Trail Run, etc.
3. **Gear selection**
   - Detected Strava gear + manual add
4. **Rules setup**
   - Per gear thresholds/intervals
5. **Review & finish**

### UX principles
- Skippable but persistent reminder until completed
- Save progress per step
- Avoid long forms, progressive disclosure

---

## Telemetry Plan (Umami)

Add events:
- `onboarding_started`
- `onboarding_step_completed`
- `onboarding_completed`
- `gear_created`
- `gear_tracking_toggled`
- `gear_rule_updated`
- `replacement_marked_done`
- `recommendation_opened`
- `recommendation_action_taken`

Keep naming stable for future dashboarding.

---

## Rollout Phases

### Phase 0: Prep (1-2 days)
- Finalize schema design
- Create migration plan
- Add feature flag: `GEAR_EXPANSION_ENABLED`

### Phase 1: Backend foundation (2-4 days)
- Add models + migrations
- Build gear service + routers
- Add onboarding status/preferences storage
- Add dual-write where needed

### Phase 2: Sync + recommendations (2-3 days)
- Update sync pipeline for multi-gear
- Build unified recommendation DTOs
- Validate mileage aggregation

### Phase 3: UI migration (3-5 days)
- Build `Gear` page and filters
- Build unified maintenance feed
- Add onboarding wizard
- Keep legacy bike view available behind fallback route

### Phase 4: Hardening (1-2 days)
- QA and regression checks
- Telemetry validation
- Performance pass
- Docs updates

---

## Acceptance Criteria
1. Existing bike users retain data and functionality.
2. New users can onboard and select activity + gear tracking.
3. Shoes can be tracked with replacement reminders.
4. Dashboard surfaces mixed gear status cleanly.
5. Sync updates mileage/status correctly for supported gear.
6. Umami events fire for onboarding and gear actions.

---

## Risks and Mitigations
- **Risk:** Migration complexity with existing bike schema.
  - **Mitigation:** dual-write + staged read cutover.
- **Risk:** UI bloat as scope grows.
  - **Mitigation:** strict IA and progressive disclosure.
- **Risk:** Inconsistent Strava gear metadata.
  - **Mitigation:** deterministic matching + manual override.

---

## Immediate Next Tasks
1. Define final Prisma schema diff for `Gear` + onboarding preferences.
2. Implement migration with backfill script.
3. Create `gear` tRPC router (read-only first).
4. Add onboarding status endpoint and middleware check.
5. Build initial `Gear` page with filters and basic cards.
