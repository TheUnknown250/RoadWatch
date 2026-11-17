# RoadWatch Nigeria

A real-time safety, security alert and incident-reporting app for Nigerian road users. People report what they see on the road, the community confirms it, and everyone can check an area, plan a safer route, alert people they trust and find emergency numbers. Moderators review reports from an admin dashboard.

Built with [Arc Studio](https://studio.arc.io)

## What you can do

- A home screen that shows a live safety score for where you are, trip suggestions, your alerts and every feature in one tap
- Safety Scan: pick any place and radius to get a colour-coded safety score, the threats found and specific advice before you travel
- EyeReport: drop a pin and report accidents, fires, suspicious activity, robbery and more, in your name or anonymously
- Safe route planner: compare routes by travel time and by reported danger along the way, with your preferences applied
- Trip Suggestions: where you may be heading, when to leave to arrive on time, and what to watch for on the way
- SOS: press and hold (or shake) to alert the people in your communities with your live location
- Safety monitor: share a trip with family or colleagues and have them told if you do not arrive on time
- Communities: private safety circles for family, estate, workplace or school, with their own alert feed
- Emergency numbers: one-tap calling for national and state numbers, plus hospitals, police and fire stations near you
- Create an account with a username and password, or continue with Google; change your password and sign out of every device
- Report an incident with a category, description, time and a pin on the map
- See incidents on an interactive map or as a list
- Search and filter by place, category, date and status
- Confirm or flag other people's reports, and add updates in the comments under a report
- Withdraw your own report while nobody has verified it, and share a link to any incident
- See road safety insights: reports per day, categories, states with the most reports, and a check of the area around you
- Show hotspots (areas with several recent reports) on the map
- Read official advisories published by administrators, such as curfews or closures
- Read safety tips, emergency guidance, FAQs and the privacy and terms page
- Delete your account and personal data
- Follow areas and get alerts, including push notifications on your device
- Install the app on your phone and keep using it with saved data when offline (saved data is clearly labelled)
- Moderators and admins review reports, change statuses and remove comments; admins also manage users and publish advisories

## Tech stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, Leaflet, TanStack Query
- Routing and places: OSRM for routes, Nominatim (OpenStreetMap) for place search and nearby services
- Backend: Node-compatible Express API written in TypeScript (run with Bun)
- Database: PostgreSQL with PostGIS
- Sign-in: username and password (Argon2id) or Google, with signed session tokens
- Firebase: Firestore (live change feed) and Cloud Messaging (push)
- Progressive Web App: web manifest and service worker

## Development

Prerequisites: [Bun](https://bun.sh), Docker (for the database).

```bash
bun install
cp .env.example .env        # then fill in the values
bun run db:up               # starts PostgreSQL + PostGIS on port 5433
bun run server              # API on http://localhost:3001 (applies migrations on start)
bun run dev                 # web app on http://localhost:5173 (proxies /api to the API)
```

Sign-in works out of the box with a username and password. To add "Continue with Google", set `GOOGLE_CLIENT_ID` (see the setup guide). To make yourself an admin, create your account in the app and run `bun run admin:promote <your-username>`.

### Environment variables

Server:

- `PORT` - API port (default 3001)
- `NODE_ENV` - `development`, `test` or `production`
- `DATABASE_URL` - PostgreSQL connection string
- `CORS_ORIGIN` - comma-separated browser origins allowed to call the API
- `ADMIN_EMAILS` - comma-separated Google emails that become admins on sign-in
- `VERIFY_CONFIRM_THRESHOLD`, `VERIFY_FLAG_THRESHOLD` - votes needed to verify or dispute a report
- `OSRM_URL` - routing service used by the route planner (default: the public OSRM demo, for development only)
- `OSRM_SUPPORTS_EXCLUDE` - set to `true` only if your routing service supports avoiding tolls, motorways and ferries
- `NOMINATIM_URL`, `GEO_USER_AGENT` - place search and nearby-services provider and the identifying name sent to it
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` - Firebase Admin service account (live updates and push only)
- `AUTH_SECRET` - secret used to sign sign-in sessions (at least 32 characters; required in production)
- `SESSION_DAYS` - how long a sign-in lasts (default 7)
- `GOOGLE_CLIENT_ID` - Google OAuth web client ID that turns on "Continue with Google"

Web app (public values):

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID` - Firebase web app config (live updates and push only)
- `VITE_FIREBASE_VAPID_KEY` - web push key for notifications

### Build, test and check

```bash
bun run build:web           # production web build into dist/
bun run db:up && bun test   # unit and API tests (needs the database running)
bun run check               # lint and type check
```

In production the API serves the built web app: set `NODE_ENV=production`, build the web app, then `bun run server`.

More detail: [docs/architecture.md](docs/architecture.md) and [docs/setup-and-deployment.md](docs/setup-and-deployment.md).
