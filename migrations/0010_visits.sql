-- Cookie-free visit counts: one row per day, public page and traffic source. No IP addresses, no user agents, no personal data.
CREATE TABLE IF NOT EXISTS visits (day TEXT NOT NULL, path TEXT NOT NULL, ref TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, path, ref));
