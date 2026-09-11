CREATE TABLE IF NOT EXISTS moat_subjects (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('anonymous', 'account')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moat_sessions (
  token_hash char(64) PRIMARY KEY,
  subject_id uuid NOT NULL REFERENCES moat_subjects(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moat_sessions_subject_idx ON moat_sessions(subject_id);

CREATE TABLE IF NOT EXISTS moat_profiles (
  subject_id uuid PRIMARY KEY REFERENCES moat_subjects(id) ON DELETE CASCADE,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS moat_workspaces (
  subject_id uuid PRIMARY KEY REFERENCES moat_subjects(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK (version = 1),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision <= 9007199254740991),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS moat_paths (
  subject_id uuid NOT NULL REFERENCES moat_subjects(id) ON DELETE CASCADE,
  id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  source_direction_id text,
  payload jsonb NOT NULL,
  PRIMARY KEY (subject_id, id),
  UNIQUE (subject_id, position)
);
-- Legacy aggregate records remain readable; new object commands enforce uniqueness.
CREATE INDEX IF NOT EXISTS moat_paths_source_direction_idx
  ON moat_paths(subject_id, source_direction_id) WHERE source_direction_id IS NOT NULL AND source_direction_id <> '';

CREATE TABLE IF NOT EXISTS moat_plans (
  subject_id uuid NOT NULL REFERENCES moat_subjects(id) ON DELETE CASCADE,
  id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  payload jsonb NOT NULL,
  PRIMARY KEY (subject_id, id),
  UNIQUE (subject_id, position)
);

CREATE TABLE IF NOT EXISTS moat_plan_paths (
  subject_id uuid NOT NULL,
  plan_id text NOT NULL,
  path_id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (subject_id, plan_id, path_id),
  UNIQUE (subject_id, plan_id, position),
  FOREIGN KEY (subject_id, plan_id) REFERENCES moat_plans(subject_id, id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id, path_id) REFERENCES moat_paths(subject_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS moat_growth_records (
  subject_id uuid NOT NULL REFERENCES moat_subjects(id) ON DELETE CASCADE,
  id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  plan_id text,
  payload jsonb NOT NULL,
  PRIMARY KEY (subject_id, id),
  UNIQUE (subject_id, position),
  FOREIGN KEY (subject_id, plan_id) REFERENCES moat_plans(subject_id, id)
);

CREATE TABLE IF NOT EXISTS moat_idempotency_receipts (
  subject_id uuid NOT NULL REFERENCES moat_subjects(id) ON DELETE CASCADE,
  operation_key text NOT NULL,
  fingerprint char(64) NOT NULL,
  workspace jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_id, operation_key)
);
CREATE INDEX IF NOT EXISTS moat_receipts_expiry_idx ON moat_idempotency_receipts(expires_at);
