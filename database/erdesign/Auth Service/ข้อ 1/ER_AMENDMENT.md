# Auth ER ข้อ 1 — approved implementation amendment

## Authority and scope

Read together with `ER_auth.drawio`, page `QHJz9qzJK7pLv-PV6rBe`, and
`log/loger/auth-service/decisions.md`. The archived audit records the state before
this work, not the final requirements. The user approved the full implementation
scope; the delegated brief explicitly confirms the key replacement below.
Runtime authority is `backend/services/auth-service/prisma/schema.prisma`, not
`database/auth-service.prisma`. This document amends the ambiguous key annotations
without rewriting the original drawing or its historical PDF.

## Approved structural interpretation

- `shop_change_request_items` uses **PK (`requests_id`, `field_name`)**.
  `requests_id` also remains an FK to `shop_change_requests.requests_id`.
  The drawing's underlined `id` must be read as **UK**, not a component of the PK.
  Existing `id` values remain unchanged and unique for legacy lookups/API output.
  A request can contain several different fields, but never two copies of a field.
- `auto_messages` has exactly `message_id`, `user_id`, `message_text`, `is_active`.
  `message_id` is the PK. `user_id` references **`seller_profiles.user_id`**, not
  `users.id` directly. The drawing's `1` label is next to the seller side and `M`
  next to the message side: one seller profile can own multiple messages.
  A buyer user without a seller profile is not a valid message owner.
- Existing SQL identifiers already follow the approved snake_case convention.
  No Auth column spelling rename is needed in this amendment.
- No timestamp, trigger, sending worker, route, or single-active-message rule is
  added. Table availability is not a claim that automatic sending is implemented.

## Implementation choices not specified by the drawing

The drawing does not fully specify SQL types, nullability, defaults or referential
actions. Existing fields keep their current contracts; this amendment does not
claim that the drawing supplied these details. The new table uses the Auth
service's existing conventions:

| Column         | Prisma / PostgreSQL        | Default                               |
| -------------- | -------------------------- | ------------------------------------- |
| `message_id`   | required String / TEXT, PK | Prisma-generated UUID; no SQL default |
| `user_id`      | required String / TEXT, FK | none                                  |
| `message_text` | required String / TEXT     | none                                  |
| `is_active`    | required Boolean / BOOLEAN | false in Prisma and PostgreSQL        |

Inactive by default avoids activating an unconfigured message. It does not
create an auto-send behavior. The seller FK uses `ON DELETE CASCADE ON UPDATE
CASCADE`, as implemented in the parent-supplied migration/schema. The item FK
keeps its existing cascade actions; changing its PK does not change ownership.
An ordinary non-unique index on `auto_messages.user_id` supports the many side.

## Verified coverage and legacy archive location

The opt-in rehearsal reads attribute edges from the **actual draw.io** and
compares physical PostgreSQL columns for all 17 entities. Each ER table's column
set matches. The new FK, composite PK, retained unique ID and consumer behavior
are tested, not inferred from Prisma validation alone.

**The `public` schema now holds exactly the 17 application tables.** The user approved
moving the non-ER archives created by `20261007125900_preserve_legacy_auth_data`
(`legacy_bulk_action_runs_20261010`; in populated legacy databases also
`legacy_admin_operations_20261010` and `legacy_report_versions_20261010`) with all
data into schema `legacy_archive`. Migration `20261014010000_archive_legacy_auth_tables`
does this with `ALTER TABLE ... SET SCHEMA` in one transaction: rows, constraints,
indexes and sequences are preserved, nothing is dropped, and a name conflict aborts
and rolls back. These tables are still not ER entities. The retention/export policy
for `legacy_archive` remains undecided. The unrelated historical `NOT VALID` audit
FKs and the existing no-history baseline helper are retained, not silently
strengthened.

See `backend/services/auth-service/prisma/ER_MIGRATION.md` and
`log/evidence/auth-service/implementation.md` for the actual rehearsal results.
