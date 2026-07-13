const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const WebSocket = require('ws');
const { createSocketHub } = require('./socket');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

test('WebSocket hub authenticates, sends initial state and broadcasts updates', async () => {
  const server = http.createServer();
  const hub = createSocketHub(server, {
    authenticate: (request) => request.headers.cookie === 'auth=yes',
    getState: () => ({ counter: 42 })
  });
  await listen(server);
  const { port } = server.address();

  const client = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Cookie: 'auth=yes' } });
  const messages = [];
  client.on('message', (data) => messages.push(JSON.parse(data.toString())));

  await new Promise((resolve, reject) => {
    client.once('open', resolve);
    client.once('error', reject);
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  hub.broadcast({ type: 'state', payload: { counter: 43 } });
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(messages[0].payload.counter, 42);
  assert.equal(messages[1].payload.counter, 43);

  client.terminate();
  await hub.close();
  await new Promise((resolve) => server.close(resolve));
});
