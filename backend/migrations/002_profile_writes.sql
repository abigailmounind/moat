ALTER TABLE moat_profiles
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0
    CHECK (revision >= 0 AND revision <= 9007199254740991),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS moat_profile_receipts (
  subject_id uuid NOT NULL REFERENCES moat_subjects(id) ON DELETE CASCADE,
  operation_key text NOT NULL,
  fingerprint char(64) NOT NULL,
  profile jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0 AND revision <= 9007199254740991),
  duplicate boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_id, operation_key)
);
CREATE INDEX IF NOT EXISTS moat_profile_receipts_expiry_idx ON moat_profile_receipts(expires_at);
