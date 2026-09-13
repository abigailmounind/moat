-- Product analytics stays separate from personal profiles. Coordinates are
-- rounded before insertion. No IP address, session or subject identifier is kept.
CREATE TABLE visitor_events (
  id TEXT PRIMARY KEY,
  visited_at TEXT NOT NULL,
  country_code TEXT,
  region TEXT,
  city TEXT,
  latitude REAL,
  longitude REAL
);
CREATE INDEX visitor_events_time_idx ON visitor_events(visited_at);
