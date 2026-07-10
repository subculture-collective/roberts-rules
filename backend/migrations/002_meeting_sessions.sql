CREATE TABLE IF NOT EXISTS meeting_enrollments (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_id text NOT NULL CHECK (length(participant_id) BETWEEN 1 AND 200),
  role text NOT NULL CHECK (role IN ('administrator','chair','parliamentarian','secretary','teller','delegate','alternate','participant','observer','technicalOperator')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_sessions (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('administrator','chair','parliamentarian','secretary','teller','delegate','alternate','participant','observer','technicalOperator')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_sessions_meeting_id_idx ON meeting_sessions(meeting_id);
