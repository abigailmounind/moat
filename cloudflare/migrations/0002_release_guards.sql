ALTER TABLE idempotency_receipts ADD COLUMN owner TEXT;
CREATE INDEX receipts_subject_expiry_idx ON idempotency_receipts(subject_id,expires_at);

-- Window identifiers contain only UTC time, model budget scope or an opaque
-- subject identifier. No prompts, answers, tokens or IP addresses are stored.
CREATE TABLE model_counters (
  scope TEXT NOT NULL,
  window INTEGER NOT NULL,
  used INTEGER NOT NULL CHECK (used >= 0),
  subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY(scope,window)
);
CREATE INDEX model_counters_subject_idx ON model_counters(subject_id);
CREATE TABLE model_leases (
  subject_id TEXT PRIMARY KEY REFERENCES subjects(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
