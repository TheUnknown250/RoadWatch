-- First-party accounts: username + password, or Google. `firebase_uid` stays as the provider identity
-- ("local:<uuid>" for passwords, "google:<sub>" for Google) so existing foreign keys are untouched.
ALTER TABLE users
  ADD COLUMN username TEXT,
  ADD COLUMN password_hash TEXT,
  ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'external' CHECK (auth_provider IN ('password', 'google', 'external'));

ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (username IS NULL OR username ~ '^[a-z0-9_.]{3,20}$');
CREATE UNIQUE INDEX users_username_key ON users (username) WHERE username IS NOT NULL;
