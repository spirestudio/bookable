-- Deposits: a service can ask for a deposit. The client pays the owner directly (the owner's own payment link or bank details);
-- the slot is held until deposit_due, then released if the owner has not marked the deposit as received.
ALTER TABLE bookings ADD COLUMN deposit REAL NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN deposit_paid INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN deposit_due INTEGER NOT NULL DEFAULT 0;
