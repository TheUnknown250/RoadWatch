CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  firebase_uid  TEXT NOT NULL UNIQUE,
  email         TEXT,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  reputation    INTEGER NOT NULL DEFAULT 0,
  is_banned     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id               SMALLSERIAL PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  severity_default SMALLINT NOT NULL DEFAULT 2 CHECK (severity_default BETWEEN 1 AND 3),
  expiry_hours     INTEGER NOT NULL DEFAULT 24 CHECK (expiry_hours > 0)
);

INSERT INTO categories (slug, name, severity_default, expiry_hours) VALUES
  ('armed-robbery',       'Armed robbery',            3, 48),
  ('kidnapping',          'Kidnapping',               3, 72),
  ('checkpoint-extortion','Checkpoint extortion',     2, 24),
  ('accident',            'Road accident',            2, 12),
  ('flooding',            'Flooding',                 2, 48),
  ('bad-road',            'Bad road / potholes',      1, 168),
  ('traffic-hazard',      'Traffic hazard',           1, 12),
  ('other',               'Other security concern',   1, 24);

CREATE TABLE incidents (
  id               BIGSERIAL PRIMARY KEY,
  reporter_id      BIGINT NOT NULL REFERENCES users(id),
  category_id      SMALLINT NOT NULL REFERENCES categories(id),
  title            TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description      TEXT NOT NULL CHECK (char_length(description) BETWEEN 10 AND 2000),
  location         geography(Point, 4326) NOT NULL,
  address_text     TEXT,
  state            TEXT,
  occurred_at      TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'verified', 'disputed', 'resolved', 'rejected', 'expired')),
  confirm_count    INTEGER NOT NULL DEFAULT 0,
  flag_count       INTEGER NOT NULL DEFAULT 0,
  idempotency_key  TEXT NOT NULL,
  moderated        BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at       TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, idempotency_key)
);

CREATE INDEX incidents_location_gix ON incidents USING GIST (location);
CREATE INDEX incidents_status_created_idx ON incidents (status, created_at DESC);
CREATE INDEX incidents_category_idx ON incidents (category_id);
CREATE INDEX incidents_occurred_idx ON incidents (occurred_at DESC);

CREATE TABLE verifications (
  id          BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  vote        TEXT NOT NULL CHECK (vote IN ('confirm', 'flag')),
  reason      TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (incident_id, user_id)
);

CREATE TABLE incident_status_history (
  id          BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_by  BIGINT REFERENCES users(id),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX status_history_incident_idx ON incident_status_history (incident_id, created_at);

CREATE TABLE notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  incident_id BIGINT REFERENCES incidents(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('nearby_incident', 'status_changed', 'report_verified', 'report_disputed')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE device_tokens (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token  TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE area_subscriptions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  center     geography(Point, 4326) NOT NULL,
  radius_m   INTEGER NOT NULL CHECK (radius_m BETWEEN 500 AND 100000),
  category_ids SMALLINT[] NOT NULL DEFAULT '{}',
  label      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX area_subscriptions_center_gix ON area_subscriptions USING GIST (center);
CREATE INDEX area_subscriptions_user_idx ON area_subscriptions (user_id);
