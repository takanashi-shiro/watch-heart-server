const http = require('node:http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 32124);
const PROTOCOL = 'watch-heart-relay/1';
const rooms = new Map();

function normalizeRoomId(value) {
  const roomId = String(value || '');
  return /^[A-Za-z0-9_-]{1,64}$/.test(roomId) ? roomId : '';
}

function normalizePeerId(value) {
  const peerId = String(value || '');
  return /^[A-Za-z0-9_-]{1,64}$/.test(peerId) ? peerId : '';
}

function normalizeName(value, fallback) {
  const name = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
  return name || fallback;
}

function generatePeerId() {
  return `peer-${Math.random().toString(36).slice(2, 10)}`;
}

function roomPath(url) {
  const match = /^\/room\/([^/]+)\/?$/.exec(url.pathname);
  return match ? normalizeRoomId(match[1]) : '';
}

function peerView(peer) {
  return {
    peerId: peer.peerId,
    name: peer.name,
    connected: Boolean(peer.connected),
    bpm: peer.connected && Number.isFinite(peer.bpm) ? peer.bpm : null,
    online: peer.ws.readyState === 1
  };
}

function send(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function broadcast(roomId, message, excludePeerId = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(message);
  for (const [peerId, peer] of room) {
    if (peerId !== excludePeerId && peer.ws.readyState === 1) peer.ws.send(data);
  }
}

function broadcastRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  broadcast(roomId, {
    type: 'room-state',
    protocol: PROTOCOL,
    roomId,
    peers: Array.from(room.values(), peerView)
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method Not Allowed');
    return;
  }

  const clients = Array.from(rooms.values()).reduce((total, room) => total + room.size, 0);
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify({
    status: 'ok',
    protocol: PROTOCOL,
    port: PORT,
    rooms: rooms.size,
    clients
  }));
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

wss.on('connection', (ws, request) => {
  const url = new URL(request.url || '/', `ws://${request.headers.host || 'localhost'}`);
  const roomId = roomPath(url);
  if (!roomId) {
    ws.close(1008, '房间 ID 无效');
    return;
  }

  const peerId = normalizePeerId(url.searchParams.get('peerId')) || generatePeerId();
  const name = normalizeName(url.searchParams.get('name'), peerId);
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  const room = rooms.get(roomId);

  const existing = room.get(peerId);
  if (existing && existing.ws !== ws) {
    try {
      existing.ws.close(4001, '同一 peerId 已重新连接');
    } catch {}
  }

  const peer = {
    ws,
    peerId,
    name,
    connected: false,
    bpm: null,
    lastSeen: Date.now()
  };
  room.set(peerId, peer);
  send(ws, {
    type: 'welcome',
    protocol: PROTOCOL,
    roomId,
    peerId,
    peers: Array.from(room.values(), peerView)
  });
  broadcastRoomState(roomId);
  broadcast(roomId, {
    type: 'peer-joined',
    protocol: PROTOCOL,
    roomId,
    peerId,
    name
  });
  console.log(`[${new Date().toISOString()}] [+] ${peerId} (${name}) joined ${roomId}`);

  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      send(ws, { type: 'error', message: 'JSON 格式无效' });
      return;
    }

    if (message.type === 'hello') {
      peer.name = normalizeName(message.name, peer.name);
      peer.lastSeen = Date.now();
      broadcastRoomState(roomId);
      return;
    }

    if (message.type === 'room-state') {
      send(ws, {
        type: 'room-state',
        protocol: PROTOCOL,
        roomId,
        peers: Array.from(room.values(), peerView)
      });
      return;
    }

    if (message.type === 'heartbeat') {
      peer.connected = Boolean(message.connected);
      peer.bpm = peer.connected && Number.isFinite(Number(message.bpm))
        ? Math.max(0, Math.min(255, Number(message.bpm)))
        : null;
      peer.name = normalizeName(message.name, peer.name);
      peer.lastSeen = Date.now();

      broadcast(roomId, {
        type: 'heartbeat',
        protocol: PROTOCOL,
        roomId,
        peerId,
        name: peer.name,
        connected: peer.connected,
        bpm: peer.bpm,
        timestamp: Date.now()
      });
      broadcastRoomState(roomId);
      return;
    }

    send(ws, { type: 'error', message: '不支持的消息类型' });
  });

  ws.on('close', () => {
    const current = room.get(peerId);
    if (!current || current.ws !== ws) return;
    room.delete(peerId);
    if (room.size === 0) rooms.delete(roomId);
    broadcast(roomId, {
      type: 'peer-left',
      protocol: PROTOCOL,
      roomId,
      peerId
    });
    broadcastRoomState(roomId);
    console.log(`[${new Date().toISOString()}] [-] ${peerId} (${name}) left ${roomId}`);
  });

  ws.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] [!] ${peerId}: ${error.message}`);
  });
});

server.listen(PORT, () => {
  console.log(`Watch Heart Relay Server running on port ${PORT}`);
});

function shutdown() {
  for (const room of rooms.values()) {
    for (const peer of room.values()) {
      try {
        peer.ws.close(1001, 'server shutting down');
      } catch {}
    }
  }
  wss.close(() => server.close(() => process.exit(0)));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
