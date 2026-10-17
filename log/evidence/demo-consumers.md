# CS/Admin demo consumer alignment

Updated `scripts/demo-cs-admin.js` for the normalized Order and Support ER contracts without changing fixture identities, scenarios, roles, or backup/reset protections.

- Order's Prisma client is wrapped with `order-service/src/models/erClient.js` so dispute and order-history projections are composed on the same client; existing local host/database checks remain in force.
- Support tickets are created through `ticketModel.create`, with the event-backed responder supplied during creation. Assignment and status changes use `ticketModel.assign` / `ticketModel.transitionStatus`; verification reads the projected status. This avoids direct writes to removed responder/status/SLA state columns and preserves their event history.
- Support backup no longer requests the removed `messages` relation. Chat remains the authoritative transcript: support messages are persisted in Chat (including INTERNAL visibility), and the Support event API records correlation metadata. Existing backup captures Chat conversations and all messages, along with Support events, assignments, status history, and SLA targets.
- The fixture applies its intended status through the supported state machine after opening each ticket. The transition uses the fixture timestamps and retains the existing user IDs, ticket IDs, and statuses.

Checks run for this scoped update are recorded in the implementation task response. No `--apply` or reset was run against compose defaults. Real Mongo-backed seed execution still requires the explicitly authorized isolated Mongo runtime; syntax, dry-run and mock/unit checks do not establish Mongo persistence or end-to-end Chat history behavior.
