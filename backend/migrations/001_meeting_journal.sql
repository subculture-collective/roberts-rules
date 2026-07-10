CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY,
  profile jsonb NOT NULL,
  aggregate_version bigint NOT NULL DEFAULT 0 CHECK (aggregate_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_events (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  aggregate_version bigint NOT NULL CHECK (aggregate_version > 0),
  event jsonb NOT NULL,
  PRIMARY KEY (meeting_id, aggregate_version)
);

CREATE TABLE IF NOT EXISTS command_decisions (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  command_id text NOT NULL,
  request_hash text NOT NULL,
  decision jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, command_id)
);
