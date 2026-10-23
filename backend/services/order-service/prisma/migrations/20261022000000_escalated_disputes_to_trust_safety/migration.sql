-- Escalated disputes now live in the Trust & Safety queue. Move cases that
-- were escalated under the old ADMIN role so they stay visible and claimable.
-- History rows in dispute_case_log are left as recorded.
UPDATE dispute_case
SET assigned_role = 'TRUST_AND_SAFETY'
WHERE assigned_role = 'ADMIN';
