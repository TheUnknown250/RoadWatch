# Setup and deployment

## 0. The database in five minutes

RoadWatch needs PostgreSQL with the PostGIS extension. The project ships a Docker file that provides both.

1. Install Docker Desktop (or Docker Engine) and make sure it is running.
2. From the project folder run `bun run db:up`. This starts PostgreSQL 16 with PostGIS on port 5433 (user `roadwatch`, password `roadwatch_dev`, database `roadwatch`). The data is kept in a Docker volume, so it survives restarts.
3. Run `bun run server`. On start the API creates every table and loads the reference data (categories and the emergency number directory). To run migrations alone use `bun run db:migrate`.
4. Check it worked: `curl http://localhost:3001/api/health` reports status ok, and `docker exec docker-db-1 psql -U roadwatch -d roadwatch -c "\dt"` lists the tables.
5. To start again from an empty database: `docker compose -f docker/compose.yml down -v` and then `bun run db:up`.

Without Docker, install PostgreSQL 14+ and PostGIS, create a database, run `CREATE EXTENSION postgis;` in it, and set `DATABASE_URL` to its connection string.

Tests use their own throwaway databases (named `roadwatch_test_*`) on the same server, so they never touch your data.

### Creating the first administrator

See "Making yourself an admin" in section 1.

## Routing, place search and nearby services

The route planner, place search and "services near me" use two OpenStreetMap-based services. Both have defaults so the app works out of the box, but the defaults are public demo servers with usage policies, meant for development and a final-year demonstration with light traffic.

| Need | Default | Setting | For production |
|---|---|---|---|
| Candidate routes | `https://router.project-osrm.org` (OSRM demo) | `OSRM_URL` | Self-host OSRM with a Nigeria extract, or use a commercial OSRM-compatible provider |
| Place search, nearby hospitals, police, fire | `https://nominatim.openstreetmap.org` | `NOMINATIM_URL`, `GEO_USER_AGENT` | Self-host Nominatim or use a provider. Set `GEO_USER_AGENT` to your app name and contact email |

The server already follows the Nominatim policy: it identifies itself, sends at most one request per second, and caches results. It limits every user's searches as well.

Self-hosting OSRM for Nigeria (about 1 GB download, run on a machine with 4 GB of RAM or more):

```bash
mkdir osrm && cd osrm
curl -LO https://download.geofabrik.de/africa/nigeria-latest.osm.pbf
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/nigeria-latest.osm.pbf
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-partition /data/nigeria-latest.osrm
docker run -t -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-customize /data/nigeria-latest.osrm
docker run -d -p 5000:5000 -v "$PWD:/data" ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/nigeria-latest.osrm
```

Then set `OSRM_URL=http://localhost:5000`. OSRM's standard car profile lists toll, motorway and ferry roads as excludable (check the profile shipped with your version), and exclusion needs the MLD setup above. If your build supports it, set `OSRM_SUPPORTS_EXCLUDE=true`; the public demo does not, so the default is `false`. With it off, the planner tells users which of their "avoid" preferences could not be applied. Toll roads are sparsely tagged in OpenStreetMap for Nigeria, so avoiding tolls may change few routes.

What the routing service does and does not do: it finds the candidate paths and the free-flow travel times. It has no live traffic, so times are estimates and the app says so. RoadWatch then adds its own layer: it measures open incidents within 300 m of each candidate and ranks routes by time plus a danger penalty.

## 1. Sign-in

**Username and password** works with no setup. Passwords are hashed with Argon2id and sessions are signed with `AUTH_SECRET`. In development a fixed secret is used and the API warns you. For production generate your own and keep it private:

```bash
bun -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

**Continue with Google** needs a free OAuth client ID:

1. Open the Google Cloud console (console.cloud.google.com), create or pick a project, then APIs and Services, OAuth consent screen. Choose External, fill in the app name and your email, and add yourself as a test user while the app is in testing.
2. Credentials, Create credentials, OAuth client ID, type **Web application**.
3. Under Authorized JavaScript origins add every address where the app runs: `http://localhost:5173` for local work, your Arc Studio preview address if you use it, and your production domain. No redirect URI is needed.
4. Copy the client ID into `GOOGLE_CLIENT_ID` in `.env` and restart the API. The Google button then appears on the sign-in page.

The Google email must be verified by Google. A Google account never merges with a username account, even if the names look alike.

**Making yourself an admin**: create your account in the app, then run `bun run admin:promote <your-username>` (use `moderator` as a second argument for moderators). Google accounts whose verified email is in `ADMIN_EMAILS` become admin on sign-in. Admins can then promote others from the Review dashboard, Users tab.

## 1b. Firebase (optional: live updates and push only)

Sign-in does not use Firebase. A Firebase project adds the live change feed and push notifications; without it the app polls every minute and push is off.

1. Create a project at the Firebase console and add a Web app. Copy its config into the `VITE_FIREBASE_*` values.
2. Firestore: create a database and deploy `firebase/firestore.rules`.
3. Cloud Messaging: generate a Web Push certificate and put the public key in `VITE_FIREBASE_VAPID_KEY`.
4. Project settings, Service accounts: generate a private key and copy `project_id`, `client_email`, `private_key` into `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`. Do not commit the key file.

## 2. Local development

```bash
bun install
cp .env.example .env
bun run db:up
bun run server
bun run dev
```

Set `ADMIN_EMAILS` to your own verified email to receive the admin role the first time you sign in. Then promote moderators from the Review dashboard, Users tab.

## 3. Production

1. Provision PostgreSQL with the PostGIS extension (a managed service that supports `CREATE EXTENSION postgis`, or the `postgis/postgis` image). Set `DATABASE_URL`.
2. Build the web app with the `VITE_FIREBASE_*` values present: `bun run build:web`.
3. Run the API with `NODE_ENV=production bun run server`. It applies migrations on start and serves `dist/` with a single-page-app fallback.
4. Put it behind HTTPS (a reverse proxy or your host's TLS). Set `CORS_ORIGIN` to your site's origin. The API trusts one proxy hop for client IP addresses (needed for rate limiting).
5. Set `AUTH_SECRET` (the API refuses to start in production without a strong one) and, if you use Google sign-in, add your production domain to the OAuth client's authorized origins.

Use a persistent volume or managed backups for the database. Single-instance rate limiting is in memory; if you run several API instances, move the limiter store to a shared service.

## 4. Operations notes

- A one-minute sweep marks monitored trips overdue (arrival time plus the grace period) and alerts the people they were shared with. Live locations are stored only as the latest point and are deleted when a trip or SOS ends.
- The emergency directory ships with only numbers that have a cited source. 112 and the Lagos 767 line are marked confirmed (official sources); 122 (FRSC) and 199 (police) come from third-party directories and are marked "confirm with the agency". Admins should verify and add numbers for their own states.
- RoadWatch cannot place a phone call or contact emergency services. SOS alerts reach RoadWatch users in your communities, and the app always shows a Call 112 button.
- Phones stop sharing location when the browser is closed or in the background. A native app would be needed for reliable background tracking; the app tells users to keep it open.

- Expiry sweep runs every 5 minutes inside the API process.
- Tune community verification with `VERIFY_CONFIRM_THRESHOLD` and `VERIFY_FLAG_THRESHOLD`.
- Map tiles come from the public OpenStreetMap server, which is not intended for heavy production traffic. Use a tile provider before launch at scale.
- Reports are public. The reporter's display name is shown, not their email.
- RoadWatch is not an emergency service; the report form tells users to call 112 first.


## Hosting: Supabase + Railway + Vercel

The web app goes on Vercel, the API on Railway, the database on Supabase.

### 1. Supabase (database)
1. Project Settings, Database, Connect. Copy the **Session pooler** connection string. Railway reaches the internet over IPv4 only, and Supabase's direct `db.<ref>.supabase.co` host can be IPv6 only, so the pooler string is the safe choice. It looks like `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
2. Replace `[YOUR-PASSWORD]` with your database password (reset it under Database settings if you do not have it). Characters such as `@` or `#` in the password must be URL-encoded. Do not add `?sslmode=...`.
3. SQL Editor, run `create extension if not exists postgis;`.

### 2. Railway (API)
1. Push the project to GitHub (`.env` is git-ignored and must stay out of it).
2. Railway, New Project, Deploy from GitHub repo, pick the repository. `railway.json` already sets the start command and the health check.
3. Variables:
   - `NODE_ENV=production`
   - `DATABASE_URL` = the Supabase string from step 1
   - `DATABASE_SSL=require`
   - `AUTH_SECRET` = 32+ random characters
   - `TRUST_PROXY=2` (Vercel plus Railway)
   - `CORS_ORIGIN` = your Vercel address
   - `GEO_USER_AGENT` = a name and contact email, as OpenStreetMap's place search requires
   - Optional: `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS`, the Firebase values
4. Settings, Networking, Generate Domain. Open `https://<domain>/api/health` and expect `"status":"ok"`.
5. The API builds its tables on first start. Check the deploy log for "Road security API listening".

### 3. First admin
Create your account in the app, then run from your computer with the production values:

```bash
DATABASE_URL="<supabase string>" DATABASE_SSL=require bun run admin:promote <your-username>
```

### 4. Vercel (web app)
Add `vercel.json` with your Railway address so `/api` calls reach the API and page refreshes work:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://YOUR-RAILWAY-DOMAIN/api/:path*" },
    { "source": "/((?!assets/|hero/|icons/|sw.js|manifest.webmanifest).*)", "destination": "/index.html" }
  ]
}
```

Build command `bun run build:web`, output directory `dist`. If you use Google sign-in, add the Vercel address to the OAuth client's authorized origins.
