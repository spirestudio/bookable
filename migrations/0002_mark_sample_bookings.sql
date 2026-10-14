-- Earlier versions saved the optional sample bookings as ordinary ones. Their client numbers all use the made-up range 07700 90010x,
-- so mark them as samples: they then show a banner, can be removed in one click, and no longer block real clients.
UPDATE bookings SET source = 'sample' WHERE phone LIKE '07700 90010_';
