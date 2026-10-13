BEGIN;

-- Move (not copy/drop) the historical non-ER archives out of public. SET SCHEMA
-- keeps the same table object: rows, constraints, indexes and owned sequences.
CREATE SCHEMA IF NOT EXISTS "legacy_archive";

DO $$
DECLARE
  archive_name TEXT;
BEGIN
  FOREACH archive_name IN ARRAY ARRAY[
    'legacy_admin_operations_20261010',
    'legacy_bulk_action_runs_20261010',
    'legacy_report_versions_20261010'
  ] LOOP
    IF to_regclass(format('public.%I', archive_name)) IS NOT NULL THEN
      -- Refuse to merge or overwrite: the whole migration rolls back.
      IF to_regclass(format('legacy_archive.%I', archive_name)) IS NOT NULL THEN
        RAISE EXCEPTION 'legacy_archive.% already exists; resolve the conflict manually', archive_name;
      END IF;
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA legacy_archive', archive_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
