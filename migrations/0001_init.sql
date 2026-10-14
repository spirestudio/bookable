-- Pencil database. Times are minutes since midnight, dates are YYYY-MM-DD in the business's own (UK) time.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  created INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  doc TEXT NOT NULL,
  updated INTEGER NOT NULL
);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start INTEGER NOT NULL,
  mins INTEGER NOT NULL,
  svc_id TEXT,
  svc_name TEXT NOT NULL,
  price REAL NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'booked',
  source TEXT NOT NULL,
  created INTEGER NOT NULL,
  reminded INTEGER NOT NULL DEFAULT 0,
  confirmed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX bookings_user_date ON bookings(user_id, date);

-- simple rate limiting for sign-in, sign-up and public bookings
CREATE TABLE rl (
  k TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX rl_k ON rl(k, ts);
