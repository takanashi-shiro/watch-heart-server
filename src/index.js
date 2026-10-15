const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// 房间管理
const rooms = new Map(); // roomId -> Map of peerId -> { ws, connected, bpm }

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', rooms: rooms.size }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'ws://localhost');
  const roomId = url.pathname.split('/').pop();
  const peerId = url.searchParams.get('peerId') || generateId();

  if (!roomId) {
    ws.close(1008, '缺少房间ID');
    return;
  }

  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  rooms.get(roomId).set(peerId, { ws, connected: false, bpm: null });

  broadcastToRoom(roomId, null, { type: 'peer-joined', peerId });
  console.log(`[+] ${peerId} 加入房间 ${roomId}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'heartbeat') {
        const peer = rooms.get(roomId)?.get(peerId);
        if (peer) {
          peer.connected = msg.connected;
          peer.bpm = msg.bpm;
        }
      }
      broadcastToRoom(roomId, peerId, msg);
    } catch (e) {}
  });

  ws.on('close', () => {
    const room = rooms.get(roomId);
    if (room) {
      room.delete(peerId);
      if (room.size === 0) rooms.delete(roomId);
    }
    broadcastToRoom(roomId, null, { type: 'peer-left', peerId });
    console.log(`[-] ${peerId} 离开房间 ${roomId}`);
  });
});

function broadcastToRoom(roomId, excludePeerId, msg) {
  const room = rooms.get(roomId);
  if (!room) return;
  const data = JSON.stringify(msg);
  room.forEach((peer, peerId) => {
    if (peerId !== excludePeerId && peer.ws.readyState === 1) {
      peer.ws.send(data);
    }
  });
}

function generateId() {
  return Math.random().toString(36).substr(2, 8);
}

server.listen(PORT, () => {
  console.log(`Watch Heart Relay Server running on port ${PORT}`);
});
