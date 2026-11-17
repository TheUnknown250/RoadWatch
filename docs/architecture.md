# Architecture

## Responsibilities

| Layer | Owns |
|---|---|
| React PWA (`src/`) | UI, Leaflet map, forms, offline cache with stale-data labels, offline report queue, push opt-in |
| Express API (`server/`) | Validation, authorization, rate limiting, every write to PostgreSQL, Firestore mirror, push delivery |
| PostgreSQL + PostGIS | Authoritative store for users, incidents, categories, verifications, status history, notifications, device tokens, area subscriptions |
| Sign-in (username/password and Google) | Handled by the API itself. Passwords are hashed with Argon2id; sessions are signed tokens; roles live in PostgreSQL |
| Firebase Firestore | Disposable `incident_events` feed that says "something changed". Written only by the API, read-only for clients (`firebase/firestore.rules`) |
| Firebase Cloud Messaging | Push delivery to opted-in devices |
| OSRM (routing) and Nominatim (places) | Candidate routes with free-flow times; place search and nearby hospitals, police and fire stations. Reached only through the API, which throttles, caches and rate-limits them |

Clients never write to Firestore. The API commits to PostgreSQL first, then mirrors a minimal event. If the mirror or push fails, the request still succeeds and clients fall back to polling (every 60 seconds).

## Database

Migrations: `server/db/migrations/*.sql`, applied automatically on API start (`bun run db:migrate` to run them alone).

- `users`: firebase_uid, email, display_name, role (`user|moderator|admin`), reputation, is_banned
- `categories`: slug, name, default severity, expiry hours (reference data seeded by the migration)
- `incidents`: reporter, category, title, description, `location geography(Point,4326)` (GiST indexed), address text, state, occurred_at, status, confirm/flag counts, idempotency key (unique per reporter), moderated flag, expires_at
- `verifications`: one vote per user per incident (`UNIQUE(incident_id, user_id)`)
- `incident_status_history`: every status change with actor and reason (audit trail)
- `notifications` (types: nearby incident, status change, verified, disputed, comment, advisory), `device_tokens`, `area_subscriptions` (center point, radius, optional category filter)
- `incident_comments`: community updates under a report; removal hides a comment rather than erasing it
- `advisories`: official notices from admins with a level, optional state and an end time
- `incidents.is_anonymous`: hides the reporter's name from everyone except the reporter and moderators (also in history and in the reporter's own comments)
- `user_settings`: trip suggestions on/off, route preferences, whether SOS goes to communities
- `saved_places` (location, usual arrival time and days) and `trip_history` (trips started from the planner): the only inputs to Trip Suggestions
- `communities`, `community_members` (owner/admin/member), `community_posts` (messages and alerts with an optional location)
- `safety_sessions` (SOS alerts and monitored trips share one lifecycle: active, overdue, ended) and `safety_session_shares` (which communities can see a session). Only the latest location is stored and it is erased when the session ends
- `emergency_contacts`: admin-managed directory with a source link and a `verified` flag

Statuses: `pending`, `verified`, `disputed`, `resolved`, `rejected`, `expired`, `withdrawn`. (The plan's `active` status was dropped: `pending` already means "open and awaiting confirmation".)

Rules:

- Votes cannot be changed or repeated; the reporter cannot vote on their own report.
- With default thresholds, 3 confirmations (and more confirmations than flags) verify a report; 3 flags (and more flags than confirmations) dispute it. Ties stay pending.
- A moderator decision locks the report against automatic community status changes.
- Incidents expire automatically after a per-category period (swept every 5 minutes).
- Rejected and withdrawn reports are visible only to their reporter and moderators.
- A reporter can withdraw a report only while it is `pending`; once the community has acted on it, only a moderator can close it.
- Insight statistics never count rejected or withdrawn reports.

## API

All paths are under `/api`. Errors are `{ "error": { "code", "message", "details?" } }`.

Public: `GET /health`, `GET /categories`, `GET /advisories`, `GET /insights/summary?days=`, `GET /insights/hotspots?days=`, `GET /insights/scan?lat&lng&radiusKm&days` (Safety Scan), `GET /directory?state=`, `GET /directory/nearby?lat&lng&radiusKm`, `GET /places/search?q=`, `GET /incidents/:id/comments`, `GET /incidents` (filters: `q`, `category`, `status`, `from`, `to`, `bbox`, `lat`+`lng`+`radiusKm`, `limit`, `offset`), `GET /incidents/:id`.

Signed in: `POST /incidents/:id/comments`, `DELETE /incidents/:id/comments/:commentId` (author or moderator), `POST /incidents/:id/withdraw`, `DELETE /me` (erase personal data), `POST /incidents`, `POST /incidents/:id/verifications`, `GET|PATCH /me`, `GET /me/incidents`, `GET|POST /me/subscriptions`, `DELETE /me/subscriptions/:id`, `POST|DELETE /me/devices`, `GET /notifications`, `POST /notifications/read-all`, `POST /notifications/:id/read`.

Planning (signed in): `GET|PATCH /me/settings`, `GET|POST /me/places`, `DELETE /me/places/:id`, `POST /routes`, `POST /trips` (record a started trip), `DELETE /trips/history`, `GET /trips/suggestions?lat&lng`.

Communities (signed in, members only; outsiders get 404 so private groups cannot be probed): `GET|POST /communities`, `POST /communities/join`, `GET|DELETE /communities/:id`, `POST /communities/:id/invite-code`, `GET /communities/:id/members`, `PATCH|DELETE /communities/:id/members/:userId`, `GET|POST /communities/:id/posts`.

Safety (signed in): `POST /safety/sos`, `POST /safety/trips`, `GET /safety/mine`, `GET /safety/shared`, `GET /safety/:id`, `POST /safety/:id/location`, `POST /safety/:id/end`.

Moderator or admin: `GET /admin/incidents`, `PATCH /admin/incidents/:id/status`, `GET /admin/stats`. Admin only: `GET|POST /admin/directory`, `DELETE /admin/directory/:id`, `GET /admin/users`, `PATCH /admin/users/:id`, `POST /admin/advisories` (optionally alerts every user), `DELETE /admin/advisories/:id` (ends it).

## How the main features work

**Safety Scan** (`/insights/scan`). Every non-rejected, non-withdrawn report inside the radius and time window adds risk points: category severity (1 to 3) x status weight (verified 1, pending 0.6, resolved 0.35, disputed 0.25) x recency (halves every 7 days) x closeness (full weight at the centre, half at the edge). Score = 100 x e^(-risk/8). Bands: 80+ low risk, 60-79 use caution, 40-59 elevated, below 40 high. The response also carries a confidence level (none/low/medium/high by report count) and per-category advice, so an empty area is reported as "no data" rather than "safe". The formula is a documented heuristic, not a validated crime model.

**Route planner** (`POST /routes`). The routing service returns up to three candidate paths. For each path the API simplifies the geometry in PostGIS (about 30 m tolerance), finds open incidents within 300 m, and computes route risk with the same risk points (recency does not matter for open incidents). Ranking uses effective minutes = travel minutes + risk x penalty, where the penalty is 6 minutes per risk point if "prefer safest" is on (default) and 1.5 otherwise. Routes are tagged fastest, safest and recommended. The planner does not implement its own graph search such as A*: path-finding is delegated to OSRM, which uses contraction-hierarchy or multi-level Dijkstra algorithms over OpenStreetMap, and RoadWatch's contribution is the safety-aware ranking on top. There is no live traffic data, and the response says `trafficAware: false`.

**Trip Suggestions** (`GET /trips/suggestions`). Two sources, nothing else: (1) saved places with a usual arrival time, suggested within three hours before that time on the days you chose; (2) destinations you started trips to at least three times in 60 days at similar times (standard deviation under 90 minutes) on weekdays or weekends, suggested from 90 minutes before to 20 minutes after your usual departure. Duplicates within 300 m are merged and at most three are shown. The departure time is arrival time minus travel time minus a 10-minute buffer, or "leave now" if that has passed. It does not read calendars or track movement in the background. Times use West Africa Time (UTC+1, no daylight saving).

**SOS and safety monitor.** An SOS creates a session shared with every community the user belongs to (unless turned off in Settings) and notifies those members in the app and by push. A monitored trip is shared with chosen communities. The browser sends the position about every 20 seconds while the page is open; reaching the destination (150 m) ends the trip automatically; a server sweep every minute marks trips overdue after the arrival time plus the grace period and warns the watchers once. RoadWatch does not call emergency services, send SMS, or track in the background; the UI says so and always offers Call 112.

**Emergency directory.** Admin-managed numbers with a source link and a confirmed flag. Nearby hospitals, police and fire stations come from OpenStreetMap through Nominatim, cached for an hour; many places have no phone number tagged, so the UI offers directions as well.

## Security controls

- Sign-in: passwords are hashed with Argon2id and never stored or logged in plain text. Sessions are HS256-signed tokens (issuer and audience checked, 7 days by default) carrying a per-account version, so "sign out of all devices", a password change or account deletion revokes every token at once. A valid token for an account that no longer exists can never create one. Banned users are refused on every request.
- Credential guessing: sign-in attempts are limited per IP and username (8 per 15 minutes), all auth requests per IP (40 per 15 minutes), sign-ups per IP (8 per hour). Wrong password and unknown username return the same message, and unknown usernames still pay the hashing cost so response time does not reveal them.
- Password rules: 8 to 128 characters, not a very common password, must not contain the username. There is no email on username accounts, so there is no email password reset; Google accounts have no password.
- Google sign-in: the browser gets an ID token from Google; the API verifies its signature against Google's published keys, the issuer, the audience (our client ID) and expiry, and requires a verified email. A Google email never merges with a username account.
- Session storage: the token is kept in the browser's local storage so it works behind the preview proxy and offline. That means an XSS bug would expose it; the production Content-Security-Policy and React's escaping are the mitigations. A native app or cookie-based sessions would be a later hardening.
- Role checks server-side; roles are never accepted from client input. Admin promotion only through `ADMIN_EMAILS` with a verified email.
- Zod validation of every body, query and id; coordinates restricted to Nigeria; report time limited to the last 7 days and not in the future.
- Duplicate protection: idempotency key per submission (retries replay the first result), a per-user lock against concurrent double submits, a block on near-identical reports by the same user within 15 minutes and 150 m, and a database uniqueness constraint on votes.
- Rate limits: per IP for the whole API, per user for reports (10/hour), votes (60/hour), comments (30/hour), community posts (30/hour), SOS (10/hour), live location (300/hour), route searches (60/hour) and place searches (40 per 15 minutes).
- Private data: community content, shared sessions and live locations are visible only to members of the communities they were shared with; everyone else receives 404. Invite codes use an unambiguous alphabet, can be regenerated, and are shown only to owners and admins.
- Account deletion removes email, followed areas, alerts and device tokens and anonymises the profile; published reports and comments stay under the name "Deleted user".
- Helmet headers, strict CORS origin list, 32 KB body limit, no stack traces or database messages in responses, parameterised SQL only.
- Production Content-Security-Policy that allows only the app, Firebase, Google Fonts and OpenStreetMap tiles.
- Secrets only in `.env` (git-ignored); `.env.example` has placeholders. The service-account key never reaches the browser.
- The development sign-in shortcut cannot be enabled in production (the API refuses to start).

## Offline behaviour

- The service worker caches the app shell and built assets, and map tiles as they are viewed (bounded to 400 tiles). It never caches `/api` responses.
- The app keeps its own copy of the last successful incident list and detail. When the server cannot be reached it shows that copy with a banner stating how old it is.
- Reports submitted offline are stored on the device with their idempotency key and sent automatically when the connection returns (only for the same signed-in user). Permanently rejected reports are dropped with a notice.
- Voting, comments, moderation and account changes need a connection. The insights page also keeps a labelled saved copy.

## Verification status (what has and has not been tested)

Tested automatically (`bun test`, against a real PostGIS database):

- Accounts: sign-up and sign-in rules, Argon2id storage, username uniqueness under concurrency, identical errors for wrong password and unknown user, rate limits, forged/expired/wrong-issuer/alg-none tokens, token revocation (sign out everywhere, password change, deletion, ban), Google sign-in with a stand-in verifier (first use, repeat use, admin email promotion, unverified email, no merge with username accounts)
- Status rules, reporting, validation, idempotent retries, concurrent double submits, near-duplicate blocking
- Search and filters: category, text, bounding box, radius, date, status; hostile input
- Voting: single vote, simultaneous duplicate votes, thresholds, reporter notifications and reputation
- Authorization: anonymous, user, moderator, admin; suspended users; IDOR on notifications and subscriptions
- Moderation audit trail, expiry, rate limits, security headers, error safety, development-token guards
- Realtime/push hooks called with the right events, and request success when they fail
- Comments (permissions, notifications, removal, rate limit), withdrawing reports, insights aggregates and area scoring, advisories (admin only, alert fan-out, ending), account erasure
- Safety Scan scoring rules, route ranking and the planner with seeded incidents (reroutes around a hazard, honest about unsupported preferences, outages), Trip Suggestions rules with a fixed clock and real trip history, anonymous reporting (no identity leaks in lists, details, history, comments, votes), communities (permissions, roles, invite codes, private feed), SOS and trip monitoring (notifications, auto-arrival, overdue sweep, location erasure), emergency directory (admin management, partial lookup failure), place search limits
- Frontend logic: formatting, filter encoding, API client errors, offline report queue

Not verified (needs your Firebase project or a real browser):

- Google sign-in against real Google servers (needs your OAuth client ID; tests use a stand-in verifier), and the Firestore mirror and Cloud Messaging delivery (need your Firebase project).
- PWA installation prompts and service-worker behaviour in a browser, and Lighthouse scores.
- The newer pages (home, scan, routes, settings, communities, safety, directory, insights, help, privacy) and components were type-checked and linted but not exercised in a browser by me.
- Live checks against the real OSRM and Nominatim public servers succeeded once during development (a Lagos route, a place search, nearby services). They are third-party services and were not part of the automated tests, which use deterministic stand-ins.
- Shake-to-SOS, background behaviour, push delivery of SOS alerts and sharing location from a real phone are untested.
- Map interaction, screen-reader and keyboard behaviour in real browsers; no component or end-to-end tests exist yet.
- Behaviour with large data volumes (the map loads up to 200 incidents per query).
