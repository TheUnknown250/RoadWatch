# Community-Driven, Real-Time Road Security Intelligence System: Plan for Approval

Status: proposal only. No application code has been written yet.

## 1. Requirements summary

Users can: register and manage accounts; submit road security incident reports (description, category, location, coordinates, timestamp); view incidents on an interactive map; confirm or flag reports; receive real-time updates and notifications; search and filter by location, category, date and status. Admins review reports and manage incidents.

Non-functional: secure auth with role-based access, server-side validation, rate limiting, duplicate-submission and duplicate-vote protection, mobile-first accessible UI, installable PWA with essential offline support (stale data clearly labelled), PostgreSQL/PostGIS as the authoritative store, tests, documentation, no secrets in source control.

## 2. Assessment of the existing project

- Supplied documents: only the implementation prompt. No proposal, dissertation or diagrams were found in the project, so the prompt is the single source of truth until you share them.
- Codebase: the untouched Arc Studio starter. React 18, Vite, TypeScript, Tailwind v3, wagmi/viem/ConnectKit wired in `src/main.tsx`, `src/App.tsx` is an empty placeholder. Nothing of the road-security system exists.
- Missing for this project: Express backend, PostgreSQL/PostGIS, Firebase SDKs, Leaflet, service worker and manifest, tests (no test runner configured).
- Environment: bun only (no npm). Docker is available with `postgres:18-alpine` cached; PostGIS is not cached. Containers have no outbound internet.

## 3. Proposed architecture

Responsibilities:

| Layer | Owns |
|---|---|
| React + Leaflet PWA | UI, map, forms, offline cache and stale-data labels, FCM token registration |
| Express API | Validation, authorization, rate limiting, all writes to PostgreSQL, Firestore fan-out, FCM sends |
| PostgreSQL + PostGIS | Authoritative store: users, incidents, categories, verifications, status history, notifications |
| Sign-in (changed later to first-party username+password and Google; see architecture.md) | Role lives in PostgreSQL |
| Firestore | Disposable realtime mirror only: a small `incident_events` feed (id, status, counts, updatedAt). Written by the API only, clients read-only. Full data is always fetched from the API |
| FCM | Push delivery to users whose subscribed area or reported incident changed |

Data flow: client writes go to the API, never directly to Firestore. API commits to PostgreSQL first, then mirrors a minimal event to Firestore. If the mirror fails, PostgreSQL stays correct and the client falls back to polling.

Layout (extends the existing project, bun workspaces not needed):

- `server/` Express app (`routes/`, `middleware/`, `db/`, `services/`, `tests/`)
- `server/db/migrations/*.sql` plain SQL migrations
- `src/components`, `src/pages`, `src/hooks`, `src/lib` frontend
- Vite proxies `/api` to the backend, as required by the preview environment.

## 4. Database design (PostgreSQL + PostGIS)

- `users`: id, firebase_uid (unique), email, display_name, role (`user|moderator|admin`), reputation, is_banned, created_at
- `categories`: id, slug, name, severity_default (e.g. robbery, kidnapping, checkpoint extortion, accident, flooding, bad road)
- `incidents`: id, reporter_id, category_id, title, description, location geography(Point,4326) with GiST index, address_text, state, occurred_at, status (`pending|active|verified|disputed|resolved|rejected|expired`), confirm_count, flag_count, created_at, updated_at, idempotency_key (unique per reporter)
- `verifications`: id, incident_id, user_id, vote (`confirm|flag`), reason, created_at, UNIQUE(incident_id, user_id); reporter cannot vote on own report
- `incident_status_history`: id, incident_id, from_status, to_status, changed_by, reason, created_at
- `notifications`: id, user_id, incident_id, type, title, body, read_at, created_at
- `device_tokens`: id, user_id, fcm_token (unique), created_at
- `area_subscriptions`: id, user_id, center geography, radius_m, categories[]
- Indexes: GiST on location, btree on (status, created_at), (category_id), (occurred_at).
- Counts are maintained in the same transaction as the vote; status moves automatically on thresholds and admins can override, every change recorded in status history.

## 5. Main pages and modules

Pages: Map (home), Incident detail, Report incident, Search/filter list, Notifications, Profile/account, Sign in/Register, Admin dashboard (review queue, status changes, user management, categories).
Modules: auth, incidents, verification, notifications, search, admin, offline/PWA.

## 6. Phased roadmap

1. Backend foundation: migrations, schema, Express app, config, error handling. Tests: DB operations.
2. Incident, verification, search APIs with validation, rate limiting, idempotency. Tests: API.
3. Auth: Firebase token verification, roles, admin endpoints.
4. Frontend: map, report flow, filters, detail view, admin dashboard.
5. Realtime and notifications: Firestore mirror, FCM, in-app notification list.
6. PWA: manifest, service worker, cached tiles/incidents with "last updated" and offline banners, report queue while offline. Security review.
7. Documentation: README, `.env.example`, setup, deployment, usage.

Each phase ends with a summary of files changed, commands run and real test results.

## 7. Risks and decisions needed

1. **Firebase credentials.** You need a Firebase project (web config, service account, VAPID key). I cannot create it. Until provided I can build against the Firebase Auth/Firestore emulators if Java is available; otherwise Firebase paths will be implemented but not verified end to end, and I will say so.
2. **PostGIS availability.** PostGIS image may not be pullable in the sandbox. Fallback: develop on plain Postgres with a PostGIS-compatible schema, or run PostGIS only in your deployment. I will test and report which applies.
3. **TypeScript backend run with bun.** Proposed over plain JavaScript Node, to match the existing project. The brief says Node.js/Express; Express runs on Bun, but production can use Node.
4. **Arc Studio scope.** This platform builds money-powered apps. Proposed variant: an optional USDC bounty pool where verified reports earn a reward, claimed via wallet. This adds contract work and is outside the stated proposal scope.
5. **Map tiles.** OpenStreetMap tiles (free, attribution required, not for heavy production use). Offline caching of tiles is limited to previously viewed areas.
6. **Moderation thresholds.** Assumed: 3 net confirmations moves `pending` to `verified`; 3 flags moves to `disputed`; incidents auto-expire after a per-category period.
7. **Privacy.** Reports are public; reporter identity shown as display name only. Option to report anonymously to the public while kept attributable to admins.
