const http = require("http");

const serverCache = new WeakMap();

function getOrCreateServer(app) {
  let entry = serverCache.get(app);
  if (entry) return entry;

  const server = http.createServer(app);
  const promise = new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      server.unref();
      resolve(server);
    });
    server.on("error", reject);
  });

  entry = { server, promise };
  serverCache.set(app, entry);
  return entry;
}

class TestRequest {
  constructor(app, method, urlPath) {
    this.app = app;
    this.method = method;
    this.urlPath = urlPath;
    this.headers = {};
    this.data = undefined;
  }

  set(field, val) {
    if (typeof field === "object" && field !== null) {
      for (const [k, v] of Object.entries(field)) {
        this.headers[k.toLowerCase()] = v;
      }
    } else if (typeof field === "string") {
      this.headers[field.toLowerCase()] = val;
    }
    return this;
  }

  send(data) {
    this.data = data;
    return this;
  }

  then(resolve, reject) {
    return this.end().then(resolve, reject);
  }

  catch(reject) {
    return this.end().catch(reject);
  }

  async end() {
    const { server, promise } = getOrCreateServer(this.app);
    await promise;
    const port = server.address().port;

    let bodyStr = "";
    if (this.data !== undefined && this.data !== null) {
      if (typeof this.data === "object") {
        bodyStr = JSON.stringify(this.data);
        if (!this.headers["content-type"]) {
          this.headers["content-type"] = "application/json";
        }
      } else {
        bodyStr = String(this.data);
      }
      this.headers["content-length"] = Buffer.byteLength(bodyStr);
    }

    if (!this.headers["connection"]) {
      this.headers["connection"] = "close";
    }

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: this.urlPath,
          method: this.method,
          headers: this.headers,
          agent: false,
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const rawBody = Buffer.concat(chunks).toString("utf8");
            let body = rawBody;
            const contentType = res.headers["content-type"] || "";
            if (contentType.includes("application/json")) {
              try {
                body = JSON.parse(rawBody);
              } catch {}
            }
            resolve({
              status: res.statusCode,
              statusCode: res.statusCode,
              headers: res.headers,
              body,
              text: rawBody,
            });
          });
        }
      );
      req.on("error", reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}

function request(app) {
  return {
    get: (url) => new TestRequest(app, "GET", url),
    post: (url) => new TestRequest(app, "POST", url),
    patch: (url) => new TestRequest(app, "PATCH", url),
    put: (url) => new TestRequest(app, "PUT", url),
    delete: (url) => new TestRequest(app, "DELETE", url),
  };
}

module.exports = request;
