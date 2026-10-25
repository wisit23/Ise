// TCP forwarding preserves HTTP streaming and WebSocket upgrades unchanged.
const net = require('node:net');
const process = require('node:process');
const console = require('node:console');

function createProxy({ targetHost, targetPort }) {
  const sockets = new Set();
  const server = net.createServer((client) => {
    const upstream = net.createConnection({ host: targetHost, port: targetPort });
    sockets.add(client);
    sockets.add(upstream);
    for (const socket of [client, upstream]) {
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => { client.destroy(); upstream.destroy(); });
    }
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
    upstream.setTimeout(10000, () => upstream.destroy());
    upstream.once('connect', () => upstream.setTimeout(0));
    client.pipe(upstream).pipe(client);
  });
  server.stop = () => {
    server.close();
    for (const socket of sockets) socket.destroy();
  };
  return server;
}

if (require.main === module) {
  const targetHost = process.env.PROXY_TARGET_HOST;
  if (!targetHost) throw new Error('PROXY_TARGET_HOST is required');
  const servers = [[3000, 30080], [8080, 30081]].map(([port, targetPort]) => {
    const server = createProxy({ targetHost, targetPort });
    server.on('error', (error) => {
      console.error(`Proxy listener ${port} failed: ${error.code}`);
      process.exit(1);
    });
    server.listen(port, '0.0.0.0');
    return server;
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    for (const server of servers) server.stop();
  });
}

module.exports = { createProxy };
