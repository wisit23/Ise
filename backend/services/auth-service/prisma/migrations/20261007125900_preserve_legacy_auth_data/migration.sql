-- Preserve historical metadata before the ER alignment contract migration.
DO $$ BEGIN
 IF to_regclass('public.admin_operations') IS NOT NULL AND to_regclass('public.legacy_admin_operations_20261010') IS NULL THEN
   ALTER TABLE admin_operations RENAME TO legacy_admin_operations_20261010;
 END IF;
 IF to_regclass('public.bulk_action_runs') IS NOT NULL AND to_regclass('public.legacy_bulk_action_runs_20261010') IS NULL THEN
   CREATE TABLE legacy_bulk_action_runs_20261010 AS TABLE bulk_action_runs;
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reports' AND column_name='version') AND to_regclass('public.legacy_report_versions_20261010') IS NULL THEN
   CREATE TABLE legacy_report_versions_20261010 AS SELECT id, version FROM reports;
 END IF;
END $$;
