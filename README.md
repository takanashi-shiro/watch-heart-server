# Watch Heart Relay Server

WebSocket 中继服务器，用于 Watch Heart 桌面应用的心率共享。

## 快速开始

```bash
cd /home/ubuntu/dev/watch-heart-server
npm install
npm start
```

服务器默认监听端口 8080，可通过 `PORT` 环境变量修改。

## 客户端连接方式

```javascript
const ws = new WebSocket('ws://your-server:8080/room/room1?peerId=player1');
```

URL 格式：`ws://server:port/room/<房间ID>?peerId=<可选的节点ID>`

## 消息格式

**客户端发送心跳：**
```json
{ "type": "heartbeat", "connected": true, "bpm": 72 }
```

**服务器推送（自动）：**
```json
{ "type": "peer-joined", "peerId": "player2" }
{ "type": "peer-left", "peerId": "player2" }
```
