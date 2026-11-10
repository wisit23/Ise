const { Readable } = require("node:stream");

// Test-only SDK transport. Consumers still issue real v3 command objects.
function createFakeS3() {
  const objects = new Map();
  const calls = [];
  let failPut = false;
  const missing = () => Object.assign(new Error("missing"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
  return {
    objects, calls,
    set failPut(value) { failPut = value; },
    async send(command) {
      const input = command.input;
      const name = command.constructor.name;
      calls.push({ name, input });
      const key = `${input.Bucket}/${input.Key}`;
      if (name === "PutObjectCommand") {
        const body = Buffer.isBuffer(input.Body) ? input.Body :
          Buffer.concat(await Array.fromAsync(input.Body));
        if (failPut) throw Object.assign(new Error("S3 unavailable"), { $metadata: { httpStatusCode: 503 } });
        objects.set(key, { body, type: input.ContentType });
        return {};
      }
      if (name === "DeleteObjectCommand") { objects.delete(key); return {}; }
      const object = objects.get(key);
      if (!object) throw missing();
      const response = { ContentType: object.type, ContentLength: object.body.length, ETag: '"test-etag"' };
      if (name === "HeadObjectCommand") return response;
      let body = object.body;
      if (input.Range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(input.Range);
        if (!match || Number(match[1]) >= body.length) {
          throw Object.assign(new Error("range"), { name: "InvalidRange", $metadata: { httpStatusCode: 416 } });
        }
        const start = Number(match[1]);
        const end = Math.min(match[2] ? Number(match[2]) : body.length - 1, body.length - 1);
        response.ContentRange = `bytes ${start}-${end}/${body.length}`;
        body = body.subarray(start, end + 1);
        response.ContentLength = body.length;
      }
      return { ...response, Body: Readable.from([body]) };
    },
  };
}
module.exports = { createFakeS3 };
