-- Trust & Safety can return an escalated dispute to the escalating CS agent
-- with a reason and an explicit checklist. Cleared when CS escalates again.
ALTER TABLE dispute_case
  ADD COLUMN return_reason TEXT,
  ADD COLUMN return_tasks TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN returned_by TEXT,
  ADD COLUMN returned_at TIMESTAMP(3);
CREATE INDEX dispute_case_escalated_by_idx ON dispute_case(escalated_by);
