-- Anonymous reporting: the public sees "Anonymous"; moderators and the reporter still see who filed it.
ALTER TABLE incidents ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO categories (slug, name, severity_default, expiry_hours) VALUES
  ('fire',                'Fire',                 3, 24),
  ('suspicious-activity', 'Suspicious activity',  2, 12),
  ('medical-emergency',   'Medical emergency',    3, 12)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('nearby_incident', 'status_changed', 'report_verified', 'report_disputed', 'comment', 'advisory',
                  'sos', 'trip_started', 'trip_overdue', 'trip_arrived', 'community_post', 'community_joined'));

CREATE TABLE user_settings (
  user_id                    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  trip_suggestions           BOOLEAN NOT NULL DEFAULT TRUE,
  avoid_tolls                BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_motorways            BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_ferries              BOOLEAN NOT NULL DEFAULT FALSE,
  prefer_safest              BOOLEAN NOT NULL DEFAULT TRUE,
  share_sos_with_communities BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE saved_places (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  kind         TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('home', 'work', 'school', 'other')),
  location     geography(Point, 4326) NOT NULL,
  address_text TEXT,
  typical_days SMALLINT[] NOT NULL DEFAULT '{}',
  arrive_by    TIME,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX saved_places_user_idx ON saved_places (user_id);

CREATE TABLE trip_history (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin            geography(Point, 4326) NOT NULL,
  destination       geography(Point, 4326) NOT NULL,
  destination_label TEXT,
  distance_m        INTEGER,
  duration_s        INTEGER,
  safety_score      SMALLINT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trip_history_user_idx ON trip_history (user_id, started_at DESC);

CREATE TABLE communities (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 60),
  type        TEXT NOT NULL CHECK (type IN ('family', 'neighborhood', 'workplace', 'school', 'other')),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 300),
  invite_code TEXT NOT NULL UNIQUE,
  created_by  BIGINT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE community_members (
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX community_members_user_idx ON community_members (user_id);

CREATE TABLE community_posts (
  id           BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  kind         TEXT NOT NULL DEFAULT 'message' CHECK (kind IN ('alert', 'message')),
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 2 AND 500),
  location     geography(Point, 4326),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX community_posts_idx ON community_posts (community_id, created_at DESC);

-- SOS alerts and monitored trips share one lifecycle. Only the latest location is kept, and it is erased when the session ends.
CREATE TABLE safety_sessions (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('sos', 'trip')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'overdue', 'ended')),
  outcome           TEXT CHECK (outcome IN ('arrived', 'safe', 'cancelled')),
  message           TEXT CHECK (message IS NULL OR char_length(message) <= 300),
  destination       geography(Point, 4326),
  destination_label TEXT,
  expected_arrival  TIMESTAMPTZ,
  grace_minutes     INTEGER NOT NULL DEFAULT 15 CHECK (grace_minutes BETWEEN 5 AND 120),
  last_location     geography(Point, 4326),
  last_seen         TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at          TIMESTAMPTZ
);
CREATE INDEX safety_sessions_user_idx ON safety_sessions (user_id, status);
CREATE INDEX safety_sessions_due_idx ON safety_sessions (expected_arrival) WHERE status = 'active' AND kind = 'trip';

CREATE TABLE safety_session_shares (
  session_id   BIGINT NOT NULL REFERENCES safety_sessions(id) ON DELETE CASCADE,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, community_id)
);

-- Admin-managed directory. Only numbers with a cited source are seeded; `verified` says whether the source is official.
CREATE TABLE emergency_contacts (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  kind        TEXT NOT NULL CHECK (kind IN ('general', 'police', 'fire', 'ambulance', 'road', 'disaster', 'hospital')),
  phone       TEXT NOT NULL CHECK (phone ~ '^[0-9+() -]{3,24}$'),
  state       TEXT,
  description TEXT,
  source_url  TEXT,
  verified    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (phone, state)
);

INSERT INTO emergency_contacts (name, kind, phone, state, description, source_url, verified) VALUES
  ('National emergency number (toll-free)', 'general', '112', NULL,
   'Routes to police, ambulance, fire, road safety and other response agencies from any network.',
   'https://www.ncc.gov.ng/media-centre/press-releases/press-release-emergency-communications-centres-launch-ncc', TRUE),
  ('Lagos State emergency response (LASEMA)', 'general', '767', 'Lagos',
   'Lagos State toll-free emergency line.', 'https://lagosstate.gov.ng/?p=11895', TRUE),
  ('Federal Road Safety Corps (FRSC)', 'road', '122', NULL,
   'Road crashes and highway emergencies. Listed by third-party directories; confirm with FRSC.',
   'https://services.travo.ng/emergency-services/emergency-services-police-fire-or-medical-assistance-in-nigeria/', FALSE),
  ('Nigeria Police emergency', 'police', '199', NULL,
   'Police emergency line. Listed by third-party directories; confirm with the Nigeria Police Force.',
   'https://services.travo.ng/emergency-services/emergency-services-police-fire-or-medical-assistance-in-nigeria/', FALSE);
