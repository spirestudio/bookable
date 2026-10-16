-- Waiting list: clients who could not find a time ask to be told if one opens up. Deleted automatically once the day has passed.
CREATE TABLE IF NOT EXISTS waitlist (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, svc_id TEXT, svc_name TEXT, date TEXT NOT NULL DEFAULT '', name TEXT NOT NULL, phone TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_waitlist_user ON waitlist (user_id);
