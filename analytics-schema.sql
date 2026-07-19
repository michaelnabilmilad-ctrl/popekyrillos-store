CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  day TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL DEFAULT '',
  visitor_hash TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '/',
  product_id TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  price REAL,
  quantity INTEGER,
  currency TEXT NOT NULL DEFAULT 'EGP',
  source TEXT NOT NULL DEFAULT 'Direct',
  search_term TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  error_type TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  status_code INTEGER
);

CREATE INDEX IF NOT EXISTS analytics_events_day_name_idx ON analytics_events(day, event_name);
CREATE INDEX IF NOT EXISTS analytics_events_event_id_idx ON analytics_events(event_name, event_id);
CREATE INDEX IF NOT EXISTS analytics_events_product_idx ON analytics_events(event_name, product_id);
CREATE INDEX IF NOT EXISTS analytics_events_source_idx ON analytics_events(day, source);
CREATE INDEX IF NOT EXISTS analytics_events_error_idx ON analytics_events(error_type, occurred_at DESC);
