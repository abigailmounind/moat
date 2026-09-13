PRAGMA foreign_keys = ON;

CREATE TABLE subjects (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('anonymous','account')),
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_subject_idx ON sessions(subject_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE profiles (
  subject_id TEXT PRIMARY KEY REFERENCES subjects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  content_json TEXT NOT NULL,
  last_operation_key TEXT,
  last_fingerprint TEXT
);

CREATE TABLE workspaces (
  subject_id TEXT PRIMARY KEY REFERENCES subjects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  content_json TEXT NOT NULL,
  last_operation_key TEXT,
  last_fingerprint TEXT
);

CREATE TABLE idempotency_receipts (
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (subject_id, operation_key)
);
CREATE INDEX receipts_expiry_idx ON idempotency_receipts(expires_at);
