-- Billing is managed by the owner from /admin. Payments are recorded by hand (bank transfer etc.): no card data is stored.
CREATE TABLE billing (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'standard',   -- standard | founding | custom | free | cancelled
  price REAL NOT NULL DEFAULT 7,            -- pounds per month
  paid_until TEXT,                          -- YYYY-MM-DD, covered up to and including this day
  note TEXT NOT NULL DEFAULT '',
  chased INTEGER NOT NULL DEFAULT 0,        -- when the owner last sent a payment reminder (ms)
  updated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL,                     -- bank | cash | card | other
  paid_on TEXT NOT NULL,                    -- YYYY-MM-DD
  note TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL
);
CREATE INDEX payments_user ON payments(user_id, paid_on);
CREATE INDEX payments_date ON payments(paid_on);

CREATE TABLE settings (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
