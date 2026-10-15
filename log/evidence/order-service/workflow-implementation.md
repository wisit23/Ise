# Order ER — workflow/evidence/hold implementation evidence

## Authorization and boundary

User approved full implementation with “เริ่มได้ bro make no mistake” after the scope summary. This record covers the parent-owned dispute workflow, evidence references and hold identifiers only. Checkout/history/outbox is a separate active unit, not claimed complete here. No application DB or real data was changed; temporary localhost PostgreSQL was used.

## Changes

- Physical `hold.source` renamed `hold_type`; Prisma property `source` remains mapped so existing service/API callers retain their contract.
- Physical `dispute_evidence.status` renamed `dispute_status`; Prisma/API property `status` remains compatible.
- New `evidence(evidence_id,dispute_evidence_id,ref_path)` contains file references. Legacy paths are copied and compared before dropping `dispute_evidence.evidence_path`. Uploads create the relation atomically; existing API/storage-key fields are assembled from the relation. Files are not moved or exposed through a new public route.
- `dispute_audit_log.dispute_id` still references DisputeEvidence, not DisputeCase, per the user decision. PK stays `dispute_audit_log_id`.
- `dispute_case` now has the 9 agreed physical columns and PK named `dispute_case_id`. The 17 workflow fields are complete versioned `WORKFLOW_STATE` snapshots in `dispute_case_log.detail`, schema_version 1 and case_version matching the committed case version.
- Migration imports old state with explicit `origin=legacy_state_import` and actual import time. It does not invent historical actions. It compares all 17 values before dropping their columns.
- Existing assignment-role log values are encoded in versioned detail envelopes preserving exact original text and timestamps before removing the two extra physical role columns.
- Derived read-only SQL view `dispute_case_state` stores no additional data. It lets PostgreSQL perform queue filtering, sorting/counting and pagination over the latest versioned state. This is not a replacement storage table or another set of persisted workflow columns.
- `disputeWorkflowClient` maintains existing repository/transaction callers through a compatibility boundary. Core CAS writes and state events commit together. Verdict keys are checked under transaction advisory locks; state types/nullability are validated before the log write.
- Public case/audit lists and counts exclude internal workflow snapshots. Assignment detail envelopes decode to the previous API detail and role fields. Agent dashboard and raw audit SQL use the new physical identifiers/projection.

## Actual checks

| Check | Observed result |
|---|---|
| Initial schema validate + generate | Order/Auth passed (Prisma 5.22.0) |
| Fresh migration deployment on parent-created `order_er` | Original baseline + evidence/hold + workflow migrations applied |
| First Order regression run | 129 tests: 119 pass, 7 fail, 3 skip; wrapper/mock/delete issues identified and fixed; Product-dependent test unavailable |
| Second Order regression run excluding cross-Product satang file | 129 tests: 126 pass, 0 fail, 3 skip (logs: `../order-tests-phase2.txt`) |
| Real hold lifecycle + access-aware queue >50 cases + 17-field round-trip/CAS/rollback | 3/3 pass, no skips |
| Populated upgrade rehearsal | Pass: all 26 old dispute values compare equal to projected values; original log text/roles/time, evidence path, hold values/payment/reference preserved; invalid evidence FK rejected; physical core has exactly 9 columns |
| Updated workflow + migration + audit tests | 5/5 pass, no skips; raw dashboard/audit exercised on PostgreSQL, no internal snapshots in counts |
| Additional fault/concurrency scenarios in workflow integration | Pass: PostgreSQL trigger rejects log write after core CAS → both roll back; competing verdict keys → one succeeds, other P2002, no duplicate state |

The populated upgrade rehearsal initially caught a quote typo in the newly added preservation assertion. The unapplied migration was corrected and the full populated rehearsal passed; no real migration had been deployed.

Second Order run skips are genuine cross-service attribution, Product reservation/expiry and live Auth/Product/Order/Chat transcript tests. These are not counted as passing. Cross-service satang test was deliberately excluded until Product is ready. These results do not certify the whole service integration or later history/outbox changes.

## Continuing work / limits

- Targeted review r2 completed (static only). Its first two “issue” headings are expressly disproved in its own analysis; transaction/projection paths were judged correct, not demonstrated defects. Parent already executed its two unrun fault/concurrency scenarios successfully. Hold fixture `ACTIVE` is deliberately an arbitrary historical value for exact preservation, while a separate actual hold-lifecycle test uses production statuses. Hash collisions in the advisory lock serialize unrelated keys rather than bypass uniqueness; uniqueness still requires the approved state writer and default READ COMMITTED isolation. No database-level UNIQUE constraint on a view is claimed. Direct raw writes and higher isolation levels are not certified. No review agreement is substituted for tests.
- Integrate the history wrapper with the dispute wrapper so every interactive transaction gets both storage transformations, then rerun consumers/integration after all service changes settle.
- Complete ER amendment/canonical-schema consistency and final lint/schema drift checks after concurrent schema ownership is released.
- Tests use `reloop_ui_order_er` in parent-owned container `ise-er-rehearsal-20261014`; migration tests create/delete only their own uniquely named rehearsal DB. No container cleanup until child tasks finish.
- All checks ran on Node v24.20.0, consistent with package.json engines. CI/.nvmrc/Docker files may still pin 22; no pinned-runtime claim.

Applied guidance: nes-mode Harness/Senior Mentor/Wayfinder + Refactoring; context-mode; background-terminals.
