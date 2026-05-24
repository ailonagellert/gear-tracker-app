# Analytics Events (Umami)

This app uses Umami custom events for product telemetry.

## Current events

### Auth
- `signup_started`
  - props: `method` (e.g. `strava`)
- `signup_completed`
  - props: `provider` (e.g. `strava`)
- `login_success`
  - props: `provider` (e.g. `strava`)
- `signout_clicked`
  - props: none

### Bike management
- `bike_created`
  - props: none
- `bike_tracking_toggled`
  - props: `enabled` (boolean)
- `tracking_mode_changed`
  - props: `mode` (`FORK_ONLY` | `FORK_AND_SHOCK`)

### Suspension
- `suspension_tracking_toggled`
  - props: `enabled` (boolean)
- `advanced_suspension_toggled`
  - props: `enabled` (boolean)
- `suspension_settings_saved`
  - props: `bike_id` (string)

### Maintenance
- `maintenance_baseline_saved`
  - props: `bike_id` (string)
- `maintenance_action`
  - props:
    - `bike_id` (string)
    - `action` (`DONE` | `SNOOZE` | `UNSNOOZE`)
    - `snooze_days` (number, optional)
- `maintenance_recommendations_refreshed`
  - props: none

### Strava sync
- `strava_sync_started`
  - props: none
- `strava_sync_failed`
  - props: none
- `strava_sync_error`
  - props: none
- `strava_sync_completed`
  - props:
    - `activities` (number)
    - `bikes_added` (number)

## Notes

- Events are fired client-side in `src/app/page.tsx` via `window.umami.track(...)`.
- `signup_completed` currently fires on first authenticated page load per browser session.
- For strict signup metrics later, add a server-side event on first user creation.
