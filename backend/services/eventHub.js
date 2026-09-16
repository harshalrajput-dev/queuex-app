const logger = require("./logger");

const clients = new Set();

function subscribe(res) {
  clients.add(res);
  res.write("retry: 3000\n\n");

  const keepAlive = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");
    } catch (err) {
      clearInterval(keepAlive);
      clients.delete(res);
    }
  }, 25000);

  res.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });

  return () => {
    clearInterval(keepAlive);
    clients.delete(res);
  };
}

function broadcast(event, data = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify({ ...data, at: new Date().toISOString() })}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch (err) {
      clients.delete(client);
    }
  }
}

function clientCount() {
  return clients.size;
}

module.exports = { subscribe, broadcast, clientCount };
