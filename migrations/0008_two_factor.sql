-- Two-factor sign-in with an authenticator app (6-digit codes). The secret is stored encrypted; recovery codes are stored hashed.
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_on INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_backup TEXT;
