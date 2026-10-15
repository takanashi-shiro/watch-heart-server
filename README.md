# Watch Heart 中继服务器

这是一个基于 WebSocket 的中继服务器，用于让多个 Watch Heart 客户端加入同一房间并共享实时心率数据。

## 项目说明

客户端连接到同一个服务器和房间 ID 后：

- 每个客户端上传自己的连接状态、BPM 和显示名称。
- 服务器将房间内所有用户的最新心率发送给房间内所有客户端。
- 客户端将房间内每个用户显示为独立的心率卡片。
- 中继服务器本身只负责转发，不会作为用户显示在客户端界面中。

## 运行方式

### 直接运行

```bash
cd /home/ubuntu/dev/watch-heart-server
npm install
npm start
```

### Docker 部署

```bash
cd /home/ubuntu/dev/watch-heart-server
docker compose up -d --build
```

服务默认监听 `32124` 端口，可以通过 `PORT` 环境变量修改。

健康检查地址：

```text
http://111.229.172.195:32124/
```

## 客户端连接

连接地址格式：

```text
ws://111.229.172.195:32124/room/<房间ID>?peerId=<节点ID>&name=<显示名称>
```

参数说明：

- `房间 ID`：只能包含字母、数字、下划线和连字符，最长 64 个字符。
- `节点 ID`：由客户端生成并保持稳定，用于断线后恢复身份。
- `显示名称`：该客户端在房间中的用户名称。

## 消息协议

### 客户端发送心率

```json
{
  "type": "heartbeat",
  "connected": true,
  "bpm": 72,
  "peerId": "peer-1",
  "name": "张三"
}
```

### 服务器广播心率

服务器会把心率发送给房间内所有客户端，包括上传者：

```json
{
  "type": "heartbeat",
  "peerId": "peer-1",
  "name": "张三",
  "connected": true,
  "bpm": 72
}
```

### 服务器广播房间状态

```json
{
  "type": "room-state",
  "roomId": "family",
  "peers": [
    {
      "peerId": "peer-1",
      "name": "张三",
      "connected": true,
      "bpm": 72,
      "online": true
    }
  ]
}
```

`room-state` 包含房间内全部用户的当前状态。用户加入、离开、改名或更新心率时，服务器都会发送新的房间状态。

## 安全说明

当前服务没有用户身份认证，适用于可信网络、VPN 或受控防火墙环境。请勿直接将服务暴露到公网。
