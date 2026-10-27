const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const net = require('node:net');
const { once } = require('node:events');
const { test } = require('node:test');
const { createProxy } = require('./port-proxy.cjs');

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

test('TCP proxy preserves HTTP upgrade and binary streams', { timeout: 10000 }, async () => {
  const upstream = net.createServer(socket => socket.pipe(socket));
  const targetPort = await listen(upstream);
  const proxy = createProxy({ targetHost: '127.0.0.1', targetPort });
  const port = await listen(proxy);
  const client = net.createConnection({ host: '127.0.0.1', port });
  try {
    await once(client, 'connect');
    const payload = Buffer.concat([
      Buffer.from('GET /socket.io/ HTTP/1.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'),
      Buffer.alloc(256 * 1024, 0xaf),
    ]);
    const chunks = [];
    let bytes = 0;
    const received = new Promise((resolve, reject) => {
      client.on('data', chunk => { chunks.push(chunk); bytes += chunk.length; if (bytes >= payload.length) resolve(Buffer.concat(chunks)); });
      client.on('error', reject);
    });
    client.write(payload);
    assert.deepEqual(await received, payload);
  } finally {
    client.destroy();
    proxy.stop();
    await new Promise(resolve => upstream.close(resolve));
  }
});

test('unreachable upstream closes client instead of crashing proxy', { timeout: 10000 }, async () => {
  const temporary = net.createServer();
  const targetPort = await listen(temporary);
  await new Promise(resolve => temporary.close(resolve));
  const proxy = createProxy({ targetHost: '127.0.0.1', targetPort });
  const port = await listen(proxy);
  try {
    const client = net.createConnection({ host: '127.0.0.1', port });
    client.on('error', () => {});
    await new Promise(resolve => client.once('close', resolve));
    assert.ok(proxy.listening);
  } finally {
    proxy.stop();
  }
});
