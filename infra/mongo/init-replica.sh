#!/bin/sh
# One-time replica-set bootstrap for the chat-service Mongo container. Prisma's
# MongoDB connector requires transactions, and Mongo only supports those on a
# replica set (even a single node), so a plain `mongod` isn't enough — this
# script is what turns the freshly-started node into rs0's primary.
#
# Runs as the docker-compose `mongo-init` one-shot service. Safe to run again
# on an already-initiated set: rs.initiate() then just errors "already
# initialized", which this script treats as success (exit 0) rather than a
# failure, so `docker compose up` stays idempotent across restarts.
set -e

MONGO_HOST="${MONGO_HOST:-mongo}"
MONGO_PORT="${MONGO_PORT:-27017}"

echo "[mongo-init] waiting for ${MONGO_HOST}:${MONGO_PORT} to accept connections..."
until mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" --quiet --eval "db.runCommand('ping').ok" >/dev/null 2>&1; do
  sleep 1
done

echo "[mongo-init] checking replica set status..."
STATUS=$(mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" --quiet --eval "
  try {
    var s = rs.status();
    print(s.ok === 1 ? 'already-initiated' : 'unknown');
  } catch (e) {
    if (e.codeName === 'NotYetInitialized') {
      print('not-initiated');
    } else {
      print('error: ' + e.message);
    }
  }
")

echo "[mongo-init] status: ${STATUS}"

case "$STATUS" in
  not-initiated)
    echo "[mongo-init] running rs.initiate()..."
    mongosh --host "$MONGO_HOST" --port "$MONGO_PORT" --quiet --eval "
      rs.initiate({
        _id: 'rs0',
        members: [{ _id: 0, host: '${MONGO_HOST}:${MONGO_PORT}' }]
      })
    "
    ;;
  already-initiated)
    echo "[mongo-init] replica set already initiated, nothing to do."
    ;;
  *)
    echo "[mongo-init] unexpected status, failing: ${STATUS}"
    exit 1
    ;;
esac

echo "[mongo-init] done."
