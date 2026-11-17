
# RoadWatch Nigeria

> Built with Arc Studio - money-powered apps in minutes

Project memory for future agents and humans.

## What This App Does

Community-driven, real-time road security intelligence for Nigerian road users (final year project). Users report incidents, the community confirms or flags them, moderators review. No wallet or onchain features; the starter's wagmi/ConnectKit wiring was removed from `src/main.tsx` and `src/config.ts` is unused.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind v3, react-router-dom v6, TanStack Query, Leaflet via react-leaflet v4, Sonner toasts
- Backend: Express 5 + TypeScript in `server/`, run with Bun (`bun run server`)
- Database: PostgreSQL + PostGIS in Docker (`docker/compose.yml`, port 5433), SQL migrations in `server/db/migrations/`
- Firebase: Auth (identity), Firestore (`incident_events` change feed, API-written only), Cloud Messaging (push)
- Extra features: comments, withdraw, insights + area check, hotspots layer, advisories, help and privacy pages, account deletion
- PWA: `public/manifest.webmanifest`, `public/sw.js`, `public/firebase-messaging-sw.js`

## Key Files

- `server/app.ts` app wiring; `server/routes/*` HTTP; `server/services/*` business logic; `server/auth.ts` auth and roles
- `server/services/status.ts` community verification rule; `server/services/incidents.ts` create/vote/moderate/expire
- `server/tests/*` API tests against a real PostGIS database (each file uses its own `roadwatch_test_*` database)
- `src/pages/*` screens, `src/components/*` UI, `src/hooks/*` data hooks, `src/lib/*` API client, offline queue, Firebase setup
- `server/services/comments.ts`, `insights.ts`, `advisories.ts`: community comments, public aggregates (area risk level is a heuristic: sum of category severity), official advisories
- `server/services/safetyScan.ts` (score), `planner.ts` (route ranking), `trips.ts` (Trip Suggestions), `communities.ts`, `safety.ts` (SOS + trip monitor), `providers.ts` (OSRM + Nominatim)
- `src/pages/HomePage.tsx` is the landing screen; the map is at `/map`
- `docs/architecture.md` design, security controls, and what is and is not verified

## Decisions

- PostgreSQL is authoritative. Firestore only says "something changed"; clients re-fetch from the API.
- Roles come only from the database; `ADMIN_EMAILS` promotes verified emails on sign-in.
- Sign-in is first-party: username/password (Argon2id via `Bun.password`) or Google ID token, both exchanged for a signed HS256 session token (`server/services/localAuth.ts`). Firebase is used only for Firestore and push. Admins are made with `bun run admin:promote <username>` or `ADMIN_EMAILS` (Google).
- The service worker never caches `/api`; stale data labelling is done in the app from its own saved copy.
- Report submissions carry an idempotency key so offline-queue retries cannot duplicate.

## To Run

```bash
bun install
bun run db:up
bun run server      # API :3001
bun run dev         # web :5173, proxies /api
bun test            # needs the database running
bun run check       # lint + typecheck
```

## Open items

- Firebase paths (sign-in, Firestore mirror, FCM) are untested against a real project.
- No browser or end-to-end tests yet.
