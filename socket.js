const { WebSocketServer, WebSocket } = require('ws');

function createSocketHub(server, { authenticate, getState }) {
  const wss = new WebSocketServer({ noServer: true, clientTracking: true });

  server.on('upgrade', (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch (_) {
      socket.destroy();
      return;
    }

    if (pathname !== '/ws') return;
    if (!authenticate(request)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit('connection', client, request);
    });
  });

  wss.on('connection', (client) => {
    client.isAlive = true;
    client.on('pong', () => { client.isAlive = true; });
    client.send(JSON.stringify({ type: 'state', payload: getState() }));
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      client.ping();
    }
  }, 30000);
  heartbeat.unref?.();

  function broadcast(message) {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  function broadcastState() {
    broadcast({ type: 'state', payload: getState() });
  }

  async function close() {
    clearInterval(heartbeat);
    for (const client of wss.clients) client.terminate();
    await new Promise((resolve) => wss.close(resolve));
  }

  return { wss, broadcast, broadcastState, close };
}

module.exports = { createSocketHub };
