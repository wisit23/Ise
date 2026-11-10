const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const path = require("node:path");

for (const signal of ["SIGTERM", "SIGINT"]) {
  test(
    `runtime handles ${signal} and closes an actual child process cleanly`,
    { timeout: 5000 },
    async (t) => {
      const child = spawn(
        process.execPath,
        [
          "-e",
          `
      const { createServiceRuntime } = require(${JSON.stringify(path.join(__dirname, "serviceRuntime"))});
      const runtime = createServiceRuntime({service:"signal-test",app:(req,res)=>res.end("ok")});
      runtime.addResource(() => console.log("resource-closed"));
      runtime.installSignals();
      runtime.server.listen(0,"127.0.0.1",()=>console.log("ready"));
      process.stdin.once("data",()=>process.emit(${JSON.stringify(signal)},${JSON.stringify(signal)}));
    `,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      t.after(() => child.kill());
      let output = "";
      await new Promise((resolve, reject) => {
        child.on("error", reject);
        child.stdout.on("data", (chunk) => {
          output += chunk;
          if (output.includes("ready")) resolve();
        });
      });
      const exited = once(child, "exit");
      // Windows cannot deliver POSIX signals with child.kill(); emit the Node
      // signal event inside the child to exercise the installed handler instead.
      child.stdin.write("shutdown");
      const [code] = await exited;
      assert.equal(code, 0);
      assert.match(output, /resource-closed/);
      assert.match(output, new RegExp(signal));
    },
  );
}

test(
  "shutdown deadline terminates a stuck request with failure status",
  { timeout: 5000 },
  async (t) => {
    const child = spawn(
      process.execPath,
      [
        "-e",
        `
    const http = require("node:http");
    const { createServiceRuntime } = require(${JSON.stringify(path.join(__dirname, "serviceRuntime"))});
    const runtime = createServiceRuntime({service:"stuck",shutdownMs:30,app:()=>runtime.shutdown()});
    runtime.server.listen(0,"127.0.0.1",()=>{
      http.get("http://127.0.0.1:"+runtime.server.address().port).on("error",()=>{});
    });
  `,
      ],
      { stdio: "ignore" },
    );
    t.after(() => child.kill());
    const [code] = await once(child, "exit");
    assert.equal(code, 1);
  },
);
