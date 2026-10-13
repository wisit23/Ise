const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");

// Explicitly opt in to our disposable rehearsal container, never a configured
// application DATABASE_URL. Each invocation creates its own database.
const container = process.env.ER_REHEARSAL_CONTAINER;
test("populated Order upgrade preserves all workflow values, roles, evidence and hold references", (t) => {
  if (!container?.startsWith("ise-er-rehearsal-")) {
    t.skip(
      "Set ER_REHEARSAL_CONTAINER to a disposable ise-er-rehearsal-* container",
    );
    return;
  }
  const database = `reloop_ui_upgrade_${randomUUID().replaceAll("-", "")}`;
  function sql(text, db = database, allowError = false) {
    const result = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-qAt",
        "-U",
        "er_test",
        "-d",
        db,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: text, encoding: "utf8", timeout: 20000 },
    );
    if (!allowError) assert.equal(result.status, 0, result.stderr);
    return result;
  }
  sql(`CREATE DATABASE "${database}";`, "order_er");
  t.after(() => sql(`DROP DATABASE "${database}";`, "order_er"));
  const migrations = path.join(__dirname, "../prisma/migrations");
  const apply = (name) =>
    sql(fs.readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  const json = (query) => JSON.parse(sql(query).stdout.trim());
  apply("20261011000000_unified_order_baseline");
  sql(`
    INSERT INTO orders (order_id,buyer_id,seller_id,product_id,order_type,original_amount,orders_amount,status,updated_at)
      VALUES ('o','buyer','seller','p','BUY_NOW',123.45,100.25,'disputed','2026-10-01 08:00:00.123');
    INSERT INTO payment (payment_id,order_id,payment_type,payment_status,payment_amount) VALUES ('pay','o','TEST','paid',100.25);
    INSERT INTO hold (hold_id,payment_id,source,reference_id,hold_reason,hold_status,hold_amount,hold_at,hold_by)
      VALUES ('h','pay','DISPUTE','d','reason','ACTIVE',100.25,'2026-10-01 08:00:00.123','buyer');
    INSERT INTO dispute_case (id,order_id,created_by,reason,decision,dispute_type,status,created_at,assigned_role,
      decision_reason,decided_by,decided_at,verdict_key,escalation_note,escalated_by,priority,priority_score,risk_report_count,
      sla_expires_at,sla_policy_version,first_review_due_at,first_reviewed_at,decision_due_at,dispute_case_version,assigned_to,assigned_at)
      VALUES ('d','o','buyer','reason','REFUND','ITEM_NOT_AS_DESCRIBED','DECIDED','2026-10-01 08:00:00.123','ADMIN',
        'decision reason','admin','2026-10-02 08:00:00.123','key','note','agent','HIGH',42,3,
        '2026-10-02 10:00:00.123','policy-v1','2026-10-01 09:00:00.123','2026-10-01 08:30:00.123','2026-10-02 10:00:00.123',7,'admin','2026-10-01 08:45:00.123');
    INSERT INTO dispute_case_log (dispute_case_log_id,dispute_case_id,actor_id,action,detail,from_assigned_role,to_assigned_role,created_at)
      VALUES ('history','d','agent','ESCALATE','{"original":"detail"}','CUSTOMER_SERVICE','ADMIN','2026-10-01 08:45:00.123');
    INSERT INTO dispute_evidence (dispute_evidence_id,dispute_case_id,uploader_id,evidence_path,file_type,status,updated_at)
      VALUES ('ev','d','buyer','private/path/หลักฐาน.jpg','image/jpeg','SUBMITTED','2026-10-01 08:00:00.123');
    INSERT INTO dispute_audit_log (dispute_audit_log_id,dispute_evidence_id,actor_id,action,detail)
      VALUES ('audit','ev','buyer','UPLOAD','existing audit');
  `);
  const before = json(
    "SELECT row_to_json(c) FROM dispute_case c WHERE id='d';",
  );
  const beforeLog = json(
    "SELECT row_to_json(l) FROM dispute_case_log l WHERE dispute_case_log_id='history';",
  );
  const beforeHold = json(
    "SELECT row_to_json(h) FROM hold h WHERE hold_id='h';",
  );
  apply("20261014000000_approved_er_evidence_and_hold");
  apply("20261014010000_log_backed_dispute_workflow");
  const after = json(
    "SELECT row_to_json(c) FROM dispute_case_state c WHERE dispute_case_id='d';",
  );
  after.id = after.dispute_case_id;
  delete after.dispute_case_id;
  assert.deepEqual(after, before);
  const afterLog = json(
    "SELECT row_to_json(l) FROM dispute_case_log l WHERE dispute_case_log_id='history';",
  );
  const detail = JSON.parse(afterLog.detail);
  assert.equal(detail.kind, "assignment_detail");
  assert.equal(detail.detail, beforeLog.detail);
  assert.equal(detail.fromAssignedRole, beforeLog.from_assigned_role);
  assert.equal(detail.toAssignedRole, beforeLog.to_assigned_role);
  assert.equal(afterLog.created_at, beforeLog.created_at);
  const afterHold = json(
    "SELECT row_to_json(h) FROM hold h WHERE hold_id='h';",
  );
  afterHold.source = afterHold.hold_type;
  delete afterHold.hold_type;
  assert.deepEqual(afterHold, beforeHold);
  const evidence = json(
    "SELECT row_to_json(e) FROM evidence e WHERE evidence_id='ev';",
  );
  assert.deepEqual(evidence, {
    evidence_id: "ev",
    dispute_evidence_id: "ev",
    ref_path: "private/path/หลักฐาน.jpg",
  });
  assert.equal(
    sql(
      "SELECT dispute_status FROM dispute_evidence WHERE dispute_evidence_id='ev';",
    ).stdout.trim(),
    "SUBMITTED",
  );
  assert.equal(
    sql(
      "SELECT dispute_id FROM dispute_audit_log WHERE dispute_audit_log_id='audit';",
    ).stdout.trim(),
    "ev",
  );
  const imported = json(
    "SELECT detail::json FROM dispute_case_log WHERE action='WORKFLOW_STATE';",
  );
  assert.equal(imported.origin, "legacy_state_import");
  assert.equal(imported.case_version, 7);
  const invalidFk = sql(
    "INSERT INTO evidence(evidence_id,dispute_evidence_id,ref_path) VALUES ('bad','missing','file');",
    database,
    true,
  );
  assert.notEqual(invalidFk.status, 0);
  assert.match(invalidFk.stderr, /foreign key constraint/);
  const columns = Number(
    sql(
      "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='dispute_case';",
    ).stdout.trim(),
  );
  assert.equal(columns, 9);
});
