const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'orders.json');

function loadOrders() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}
function saveOrders(orders) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(orders));
}

let orders = loadOrders();
let nextId = orders.length ? Math.max(...orders.map(o => o.id)) + 1 : 1;
const clients = new Set();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  clients.forEach(ws => { try { ws.send(data); } catch {} });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (url.pathname === '/api/orders' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(orders)); return;
  }

  if (url.pathname === '/api/orders' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const order = JSON.parse(body);
        order.id = nextId++;
        orders.unshift(order);
        saveOrders(orders);
        broadcast({ type: 'new_order', order });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, order }));
      } catch { res.writeHead(400); res.end('Bad Request'); }
    }); return;
  }

  const doneMatch = url.pathname.match(/^\/api\/orders\/(\d+)\/done$/);
  if (doneMatch && req.method === 'POST') {
    const id = parseInt(doneMatch[1]);
    const order = orders.find(o => o.id === id);
    if (order) {
      order.done = true;
      saveOrders(orders);
      broadcast({ type: 'order_done', id });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } else { res.writeHead(404); res.end('Not found'); }
    return;
  }

  // Serve static files
  let filePath = url.pathname === '/' ? '/front.html' : url.pathname;
  filePath = path.join(__dirname, 'public', filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on('connection', ws => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`羅絲莉莉點餐系統啟動！Port: ${PORT}`);
});
