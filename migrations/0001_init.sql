CREATE TABLE IF NOT EXISTS roberts_rules_metadata (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
