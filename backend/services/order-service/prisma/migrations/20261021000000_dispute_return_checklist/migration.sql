-- Return tasks become a checklist CS can tick off with a note per item.
ALTER TABLE dispute_case ADD COLUMN return_checklist JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE dispute_case d
SET return_checklist = COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'id', md5(d.dispute_case_id || ':' || t.ord), 'text', t.task,
    'done', false, 'note', '', 'doneBy', NULL, 'doneAt', NULL) ORDER BY t.ord)
  FROM unnest(d.return_tasks) WITH ORDINALITY AS t(task, ord)
), '[]'::jsonb);
ALTER TABLE dispute_case DROP COLUMN return_tasks;
ALTER TABLE dispute_case RENAME COLUMN return_checklist TO return_tasks;
