const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Execute the actual github-script provenance gate against the Actions API
// boundary. An in-progress push run is trusted only by its own dependent job.
const workflow = fs.readFileSync(
  path.resolve(__dirname, "../../.github/workflows/aws-eks-staging.yml"),
  "utf8",
);
const source = workflow
  .match(/ {10}script: \|\r?\n([\s\S]*?)(?=\r?\n {6}-)/)[1]
  .split(/\r?\n/)
  .map((line) => line.replace(/^ {12}/, ""))
  .join("\n");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const validate = new AsyncFunction(
  "github",
  "context",
  "core",
  "process",
  source,
);

function runRecord(overrides = {}) {
  return {
    path: ".github/workflows/aws-release.yml",
    head_branch: "fullcloudstaging",
    event: "push",
    status: "in_progress",
    conclusion: null,
    id: 123,
    head_sha: "abc123",
    run_attempt: 1,
    head_repository: { full_name: "wisit23/Ise" },
    ...overrides,
  };
}

async function check(run, auto = true) {
  const exported = {};
  await validate(
    { rest: { actions: { getWorkflowRun: async () => ({ data: run }) } } },
    { repo: { owner: "wisit23", repo: "Ise" }, runId: 123, sha: "abc123" },
    {
      exportVariable: (name, value) => {
        exported[name] = value;
      },
    },
    {
      env: {
        AUTO: String(auto),
        SOURCE_RUN: "123",
        AWS_ACCOUNT_ID: "997229934811",
        DEPLOY: "true",
        COMPATIBLE: "true",
        GITHUB_RUN_ATTEMPT: "1",
      },
    },
  );
  return exported;
}

test("dependent push deploy accepts its running build and pins artifact release identity", async () => {
  assert.deepEqual(await check(runRecord()), {
    RELEASE_COMMIT: "abc123",
    RELEASE_VERSION: "abc123-123-1",
  });
});

test("automatic deploy rejects another run, attempt, commit, branch, event or repository", async () => {
  for (const overrides of [
    { id: 456 },
    { run_attempt: 2 },
    { head_sha: "other" },
    { head_branch: "main" },
    { event: "pull_request" },
    { event: "workflow_dispatch" },
    { status: "completed", conclusion: "failure" },
    { head_repository: { full_name: "fork/Ise" } },
    { path: ".github/workflows/other.yml" },
  ])
    await assert.rejects(check(runRecord(overrides)), /trusted staging build/);
});

test("manual deployment accepts completed successful trusted push or manual builds", async () => {
  for (const event of ["push", "workflow_dispatch"]) {
    await check(
      runRecord({ event, status: "completed", conclusion: "success" }),
      false,
    );
    await assert.rejects(
      check(runRecord({ event }), false),
      /trusted staging build/,
    );
    await assert.rejects(
      check(
        runRecord({ event, status: "completed", conclusion: "failure" }),
        false,
      ),
      /trusted staging build/,
    );
  }
});
