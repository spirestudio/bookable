-- A private, secret link per business that serves its bookings as an .ics calendar feed.
ALTER TABLE profiles ADD COLUMN cal_token TEXT;
CREATE UNIQUE INDEX profiles_cal ON profiles(cal_token);
