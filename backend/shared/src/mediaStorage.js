const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { pipeline } = require("node:stream/promises");
const { badRequest, notFound } = require("./errors");

function isMissing(error) {
  return error.code === "ENOENT" || error.name === "NoSuchKey" ||
    error.name === "NotFound" || error.$metadata?.httpStatusCode === 404;
}

/** Keep object keys and public URLs independent of the selected storage driver.
 * S3 buckets stay private: only the existing HTTP routes expose their contents.
 */
function createMediaStorage({ directory, namespace, env = process.env, client }) {
  const driver = env.MEDIA_STORAGE_DRIVER || "docker";
  if (!["docker", "s3"].includes(driver)) {
    throw new Error("MEDIA_STORAGE_DRIVER must be docker or s3");
  }
  const root = path.resolve(directory);
  const uploadDirectory = driver === "docker" ? root :
    path.join(os.tmpdir(), "reloop-media", namespace);
  fs.mkdirSync(uploadDirectory, { recursive: true });

  let sdk;
  let bucket;
  let prefix;
  if (driver === "s3") {
    bucket = env.S3_BUCKET;
    if (!bucket || !env.AWS_REGION) throw new Error("S3_BUCKET and AWS_REGION are required for S3 media storage");
    if (Boolean(env.AWS_ACCESS_KEY_ID) !== Boolean(env.AWS_SECRET_ACCESS_KEY)) {
      throw new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be supplied together");
    }
    const base = env.S3_KEY_PREFIX || "reloop";
    if (!/^[a-zA-Z0-9_/-]+$/.test(base) || base.split("/").some((part) => part === "..")) {
      throw new Error("S3_KEY_PREFIX must be a safe object-key prefix");
    }
    prefix = `${base.replace(/^\/+|\/+$/g, "")}/${namespace}/`;
    sdk = require("@aws-sdk/client-s3");
    client ||= new sdk.S3Client({
      region: env.AWS_REGION,
      // Omit explicit credentials for IAM roles / the SDK default chain.
      ...(env.AWS_ACCESS_KEY_ID ? { credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        ...(env.AWS_SESSION_TOKEN ? { sessionToken: env.AWS_SESSION_TOKEN } : {}),
      } } : {}),
    });
  }

  function validateKey(key) {
    if (typeof key !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(key)) {
      throw badRequest("invalid media storage key");
    }
    return key;
  }
  function absolutePath(key) {
    return path.join(root, validateKey(key));
  }
  function objectKey(key) {
    return prefix + validateKey(key);
  }
  async function put(key, body, contentType = "application/octet-stream") {
    validateKey(key);
    if (driver === "docker") {
      await fsp.writeFile(absolutePath(key), body, { flag: "wx" });
      return;
    }
    await client.send(new sdk.PutObjectCommand({
      Bucket: bucket, Key: objectKey(key), Body: body,
      ContentType: contentType,
      ...(Buffer.isBuffer(body) ? { ContentLength: body.length } : {}),
    }));
  }
  async function persistUpload(file) {
    validateKey(file.filename);
    if (driver === "docker") return;
    const stat = await fsp.stat(file.path);
    const body = fs.createReadStream(file.path);
    try {
      await client.send(new sdk.PutObjectCommand({
        Bucket: bucket, Key: objectKey(file.filename), Body: body,
        ContentType: file.mimetype || "application/octet-stream", ContentLength: stat.size,
      }));
    } finally {
      body.destroy();
    }
    await fsp.rm(file.path, { force: true });
  }
  async function remove(key) {
    if (driver === "docker") return fsp.rm(absolutePath(key), { force: true });
    await client.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: objectKey(key) }));
  }
  async function discardUpload(file) {
    if (!file) return;
    // Always attempt both remote rollback and local scratch cleanup.
    const results = await Promise.allSettled([
      remove(file.filename),
      ...(driver === "s3" ? [fsp.rm(file.path, { force: true })] : []),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
  }
  async function assertExists(key) {
    try {
      if (driver === "docker") {
        if (!(await fsp.stat(absolutePath(key))).isFile()) throw notFound("media file not found");
      } else {
        await client.send(new sdk.HeadObjectCommand({ Bucket: bucket, Key: objectKey(key) }));
      }
    } catch (error) {
      if (isMissing(error)) {
        const missing = notFound("media file not found");
        missing.code = "ENOENT";
        throw missing;
      }
      throw error;
    }
    return absolutePath(key);
  }
  async function send(req, res, next, key) {
    try {
      if (driver === "docker") {
        res.sendFile(absolutePath(key), (error) => { if (error) next(error); });
        return;
      }
      const input = { Bucket: bucket, Key: objectKey(key) };
      const head = req.method === "HEAD";
      const object = await client.send(head ? new sdk.HeadObjectCommand(input) :
        new sdk.GetObjectCommand({ ...input, ...(req.headers.range ? { Range: req.headers.range } : {}) }));
      // Do not overwrite a private endpoint's validated MIME type.
      if (!res.getHeader("Content-Type") && object.ContentType) res.setHeader("Content-Type", object.ContentType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Accept-Ranges", "bytes");
      if (object.ContentLength !== undefined) res.setHeader("Content-Length", object.ContentLength);
      if (object.ETag) res.setHeader("ETag", object.ETag);
      if (object.LastModified) res.setHeader("Last-Modified", object.LastModified.toUTCString());
      if (object.ContentRange) {
        res.status(206);
        res.setHeader("Content-Range", object.ContentRange);
      }
      if (head) return res.end();
      await pipeline(object.Body, res);
    } catch (error) {
      if (res.headersSent) return res.destroy(error);
      if (isMissing(error)) return next(notFound("media file not found"));
      if (error.$metadata?.httpStatusCode === 416 || error.name === "InvalidRange") return res.status(416).end();
      next(error);
    }
  }
  function publicMiddleware(req, res, next) {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path === "/") return next();
    try {
      const key = decodeURIComponent(req.path.slice(1));
      return send(req, res, next, key);
    } catch (error) {
      next(error instanceof URIError ? badRequest("invalid media URL") : error);
    }
  }
  function multerStorage(multer, { defer = false } = {}) {
    const disk = multer.diskStorage({
      destination: uploadDirectory,
      filename(req, file, cb) {
        cb(null, `${require("node:crypto").randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
      },
    });
    if (driver === "docker" || defer) return disk;
    return {
      _handleFile(req, file, cb) {
        disk._handleFile(req, file, (error, info) => {
          if (error) return cb(error);
          const uploaded = { ...file, ...info };
          persistUpload(uploaded).then(() => cb(null, info), async (failure) => {
            await discardUpload(uploaded).catch(() => {});
            cb(failure);
          });
        });
      },
      _removeFile(req, file, cb) {
        discardUpload(file).then(() => cb(null), cb);
      },
    };
  }
  return { driver, uploadDirectory, absolutePath, put, persistUpload, remove,
    discardUpload, assertExists, send, publicMiddleware, multerStorage };
}

module.exports = { createMediaStorage, isMissingMedia: isMissing };
