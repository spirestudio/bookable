-- Customer accounts: a person who books with businesses can keep their appointments in one place.
-- Separate from owner accounts, so a customer sign-in can never open an owner's app.
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);
ALTER TABLE bookings ADD COLUMN client_id TEXT;
CREATE INDEX bookings_client ON bookings(client_id);
