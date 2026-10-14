-- Optional public directory: a business appears in search only if its owner switches it on.
ALTER TABLE profiles ADD COLUMN listed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN search TEXT NOT NULL DEFAULT '';
CREATE INDEX profiles_listed ON profiles(listed, updated);
