-- Owners can connect their own Telegram to get an alert when a client books. tg_code is a one-time link token.
ALTER TABLE users ADD COLUMN tg_chat TEXT;
ALTER TABLE users ADD COLUMN tg_code TEXT;
