BEGIN;

-- Preserve the current values as an explicitly imported state, NOT a claim
-- that historical workflow events occurred at fabricated times.
INSERT INTO "dispute_case_log" ("dispute_case_log_id", "dispute_case_id", "actor_id", "action", "detail", "created_at")
SELECT 'workflow-import:' || c."id", c."id", c."created_by", 'WORKFLOW_STATE',
  jsonb_build_object(
    'schema_version', 1, 'case_version', c."dispute_case_version",
    'origin', 'legacy_state_import',
    'state', jsonb_build_object(
      'status', c."status", 'createdAt', c."created_at", 'assignedRole', c."assigned_role",
      'decisionReason', c."decision_reason", 'decidedBy', c."decided_by", 'decidedAt', c."decided_at",
      'verdictKey', c."verdict_key", 'escalationNote', c."escalation_note", 'escalatedBy', c."escalated_by",
      'priority', c."priority", 'priorityScore', c."priority_score", 'riskReportCount', c."risk_report_count",
      'slaExpiresAt', c."sla_expires_at", 'slaPolicyVersion', c."sla_policy_version",
      'firstReviewDueAt', c."first_review_due_at", 'firstReviewedAt', c."first_reviewed_at", 'decisionDueAt', c."decision_due_at"
    )
  )::text, CURRENT_TIMESTAMP
FROM "dispute_case" c;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "dispute_case" c
    LEFT JOIN "dispute_case_log" l ON l."dispute_case_log_id" = 'workflow-import:' || c."id"
    WHERE l."dispute_case_log_id" IS NULL
      OR (l."detail"::jsonb ->> 'case_version')::integer <> c."dispute_case_version"
      OR l."detail"::jsonb -> 'state' IS DISTINCT FROM jsonb_build_object(
        'status', c."status", 'createdAt', c."created_at", 'assignedRole', c."assigned_role",
        'decisionReason', c."decision_reason", 'decidedBy', c."decided_by", 'decidedAt', c."decided_at",
        'verdictKey', c."verdict_key", 'escalationNote', c."escalation_note", 'escalatedBy', c."escalated_by",
        'priority', c."priority", 'priorityScore', c."priority_score", 'riskReportCount', c."risk_report_count",
        'slaExpiresAt', c."sla_expires_at", 'slaPolicyVersion', c."sla_policy_version",
        'firstReviewDueAt', c."first_review_due_at", 'firstReviewedAt', c."first_reviewed_at", 'decisionDueAt', c."decision_due_at"
      )
  ) THEN
    RAISE EXCEPTION 'Dispute cutover blocked: legacy workflow state was not preserved';
  END IF;
END $$;

-- Retain assignment-role details and original text/timestamps on each actual
-- historical event before removing the two attributes absent from the ER.
UPDATE "dispute_case_log"
SET "detail" = jsonb_build_object(
  'schema_version', 1, 'kind', 'assignment_detail', 'detail', "detail",
  'fromAssignedRole', "from_assigned_role", 'toAssignedRole', "to_assigned_role"
)::text
WHERE "action" <> 'WORKFLOW_STATE';
ALTER TABLE "dispute_case_log" DROP COLUMN "from_assigned_role", DROP COLUMN "to_assigned_role";

ALTER TABLE "dispute_case" RENAME COLUMN "id" TO "dispute_case_id";
ALTER TABLE "dispute_case"
  DROP COLUMN "status", DROP COLUMN "created_at", DROP COLUMN "assigned_role",
  DROP COLUMN "decision_reason", DROP COLUMN "decided_by", DROP COLUMN "decided_at",
  DROP COLUMN "verdict_key", DROP COLUMN "escalation_note", DROP COLUMN "escalated_by",
  DROP COLUMN "priority", DROP COLUMN "priority_score", DROP COLUMN "risk_report_count",
  DROP COLUMN "sla_expires_at", DROP COLUMN "sla_policy_version",
  DROP COLUMN "first_review_due_at", DROP COLUMN "first_reviewed_at", DROP COLUMN "decision_due_at";

-- A derived read-only view keeps queue filtering/ordering/pagination inside
-- PostgreSQL. It stores no duplicate workflow data or additional ER columns.
CREATE VIEW "dispute_case_state" AS
SELECT c.*,
  s.state ->> 'status' AS "status",
  (s.state ->> 'createdAt')::timestamp(3) AS "created_at",
  s.state ->> 'assignedRole' AS "assigned_role",
  s.state ->> 'decisionReason' AS "decision_reason",
  s.state ->> 'decidedBy' AS "decided_by",
  (s.state ->> 'decidedAt')::timestamp(3) AS "decided_at",
  s.state ->> 'verdictKey' AS "verdict_key",
  s.state ->> 'escalationNote' AS "escalation_note",
  s.state ->> 'escalatedBy' AS "escalated_by",
  s.state ->> 'priority' AS "priority",
  (s.state ->> 'priorityScore')::integer AS "priority_score",
  (s.state ->> 'riskReportCount')::integer AS "risk_report_count",
  (s.state ->> 'slaExpiresAt')::timestamp(3) AS "sla_expires_at",
  s.state ->> 'slaPolicyVersion' AS "sla_policy_version",
  (s.state ->> 'firstReviewDueAt')::timestamp(3) AS "first_review_due_at",
  (s.state ->> 'firstReviewedAt')::timestamp(3) AS "first_reviewed_at",
  (s.state ->> 'decisionDueAt')::timestamp(3) AS "decision_due_at"
FROM "dispute_case" c
JOIN LATERAL (
  SELECT l."detail"::jsonb -> 'state' AS state
  FROM "dispute_case_log" l
  WHERE l."dispute_case_id" = c."dispute_case_id" AND l."action" = 'WORKFLOW_STATE'
  ORDER BY (l."detail"::jsonb ->> 'case_version')::integer DESC, l."created_at" DESC, l."dispute_case_log_id" DESC
  LIMIT 1
) s ON true;

COMMIT;
