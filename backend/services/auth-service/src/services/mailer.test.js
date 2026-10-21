const test = require("node:test");
const assert = require("node:assert/strict");
const { createMailer } = require("./mailer");

test("send stamps the configured sender and hands everything to the transport", async () => {
  const delivered = [];
  const mailer = createMailer(
    { transport: "smtp", from: "RE-LOOP <noreply@shop.example>" },
    { transport: { sendMail: async (message) => delivered.push(message) } },
  );
  await mailer.send({ to: "a@example.com", subject: "s", text: "t", html: "<p>h</p>" });
  assert.deepEqual(delivered, [
    { from: "RE-LOOP <noreply@shop.example>", to: "a@example.com", subject: "s", text: "t", html: "<p>h</p>" },
  ]);
});

test("transport failures propagate so callers can log them", async () => {
  const mailer = createMailer(
    { transport: "smtp", from: "x@y.co" },
    { transport: { sendMail: async () => { throw new Error("535 auth failed"); } } },
  );
  await assert.rejects(mailer.send({ to: "a@example.com", subject: "s", text: "t" }), /535/);
});
