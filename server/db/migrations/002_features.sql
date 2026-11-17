-- Reporters can withdraw their own pending reports.
ALTER TABLE incidents DROP CONSTRAINT incidents_status_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_status_check
  CHECK (status IN ('pending', 'verified', 'disputed', 'resolved', 'rejected', 'expired', 'withdrawn'));

-- New notification kinds: replies on your report and official advisories.
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('nearby_incident', 'status_changed', 'report_verified', 'report_disputed', 'comment', 'advisory'));

CREATE TABLE incident_comments (
  id          BIGSERIAL PRIMARY KEY,
  incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 2 AND 500),
  hidden      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX incident_comments_incident_idx ON incident_comments (incident_id, created_at);

-- Official advisories published by admins (road closures, curfews, verified warnings).
CREATE TABLE advisories (
  id         BIGSERIAL PRIMARY KEY,
  title      TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 1000),
  severity   TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  state      TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX advisories_active_idx ON advisories (expires_at DESC);

CREATE INDEX incidents_state_idx ON incidents (state);
