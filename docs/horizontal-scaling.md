# Horizontal scaling: application contract

## Implemented

- Gateway and all five backend services expose unauthenticated `GET /ready` through their production HTTP server. The existing app-level `/health` routes are unchanged during normal operation.
- `/ready` returns 200 only when its dependency probes succeed; failures and a two-second probe timeout return 503 without leaking connection details. At most one actual probe is in flight per process. The relational services probe PostgreSQL; chat probes MongoDB and the Socket.IO Redis clients; product probes PostgreSQL and its auction event Redis relay. Gateway readiness covers its own process, not all downstream services.
- `SIGTERM` and `SIGINT` stop accepting HTTP connections and new periodic work. Existing requests and active worker rounds finish before database/resource cleanup. New requests on surviving connections receive 503 while draining. Socket.IO, gateway WebSocket pipes and auction SSE connections close so clients can reconnect to another instance.
- `SHUTDOWN_TIMEOUT_MS` defaults to 30000. A hung shutdown destroys inbound connections and exits with code 1 at the deadline. Normal shutdown exits with code 0. Work is not guaranteed to finish past this deadline.
- Periodic tasks do not overlap inside a process. Existing database compare-and-set/version guards, unique receipts and BullMQ job claiming remain responsible for safe retries across replicas; periodic sweeps are not globally singleton jobs.
- Chat-to-support delivery claims each attempt atomically using the persisted retry timestamp. A crashed claim becomes eligible after the HTTP request timeout plus 30 seconds. Support's existing message-ID receipt still handles duplicate delivery after crashes; delivery is at-least-once, not exactly-once.
- Auction SSE invalidations fan out through Redis pub/sub across product instances. Local events are delivered immediately and origin IDs prevent Redis echoes. Pub/sub is not a durable event log; clients must refresh auction state after reconnecting.

## Deployment prerequisites (not configured by this change)

1. Put a load balancer in front of gateway replicas and use `/ready` for target readiness. Probe each backend's own `/ready` where the platform routes to that service. Do not direct a backend health probe through the gateway's frontend catch-all.
2. Keep service URLs pointed at stable internal load-balanced service names, not individual replica IPs.
3. Set the platform termination grace period longer than `SHUTDOWN_TIMEOUT_MS` and configure load-balancer deregistration/draining. Send SIGTERM before forcing termination.
4. All replicas of a service must share the correct database, Redis deployment, signing secrets, and internal authentication configuration. Provision database connection limits for the maximum replica count. Product and chat need healthy Redis for cross-instance realtime delivery.
5. Socket.IO HTTP long-polling requires sticky routing to the same chat instance for one Engine.IO session, even with the Redis adapter. Configure affinity at every balancing hop that can select a different chat instance. A WebSocket-only deployment avoids the polling affinity requirement but requires separately configuring clients and proxies; this change preserves existing polling support.
6. Configure shared media storage (the existing S3 work is separate). Local upload directories must not be treated as shared persistent storage across instances.
7. Configure instance minimum/maximum counts and scaling metrics in the platform. This code does not provision a load balancer, autoscaler, Redis, storage, or database and does not deploy anything.

## Verification

Focused runtime tests use actual local HTTP servers and child processes. Windows tests emit Node signal events inside a child because Windows cannot deliver POSIX SIGTERM through `child.kill()`; this exercises the installed handlers, not OS-level Linux signal delivery. Auction cross-replica and chat claim unit tests use simulated Redis/database boundaries. Run multi-replica integration tests with disposable real Redis, MongoDB replica set and PostgreSQL before production rollout. Docker was unavailable during this implementation, so those real-infrastructure checks were not performed.
