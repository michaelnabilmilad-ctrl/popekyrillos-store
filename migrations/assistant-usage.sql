-- No chat content or customer details are stored in this table.
CREATE TABLE IF NOT EXISTS assistant_usage (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assistant_usage_expires ON assistant_usage(expires);
