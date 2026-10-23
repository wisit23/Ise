ALTER TABLE dispute_case
  ADD COLUMN archived_at TIMESTAMP(3),
  ADD COLUMN deleted_at TIMESTAMP(3),
  ADD COLUMN retention_until TIMESTAMP(3);
CREATE INDEX dispute_case_archived_at_deleted_at_decided_at_idx
  ON dispute_case(archived_at, deleted_at, decided_at);
