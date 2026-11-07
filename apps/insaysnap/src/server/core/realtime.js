'use strict';

/**
 * Insay Social Ecosystem — Real-Time WebSocket & WebRTC Engine
 * Zero-dependency RFC 6455 WebSocket server with rooms/channels,
 * presence tracking, typing indicators, and WebRTC peer signaling.
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');

class RealtimeHub extends EventEmitter {
  constructor(httpServer, options = {}) {
    super();
    this.httpServer = httpServer;
    this.clients = new Map(); // socket -> client metadata
    this.rooms = new Map(); // roomId -> Set of sockets
    this.userSockets = new Map(); // userId -> Set of sockets

    this.setupUpgradeHandler();
    this.setupHeartbeat();
  }

  setupUpgradeHandler() {
    this.httpServer.on('upgrade', (req, socket, head) => {
      // Validate WebSocket handshake request
      const key = req.headers['sec-websocket-key'];
      const upgrade = req.headers['upgrade'];

      if (!upgrade || upgrade.toLowerCase() !== 'websocket' || !key) {
        socket.destroy();
        return;
      }

      // Compute Sec-WebSocket-Accept
      const accept = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
      );

      const client = {
        socket,
        userId: null,
        username: null,
        rooms: new Set(),
        isAlive: true,
        lastPing: Date.now()
      };

      this.clients.set(socket, client);

      socket.on('data', buf => this.handleSocketData(socket, buf));
      socket.on('close', () => this.handleSocketClose(socket));
      socket.on('error', () => {
        socket.destroy();
        this.handleSocketClose(socket);
      });
    });
  }

  handleSocketData(socket, buf) {
    if (buf.length < 2) return;
    const client = this.clients.get(socket);
    if (!client) return;

    const opcode = buf[0] & 0x0f;

    // Close frame (opcode 8)
    if (opcode === 8) {
      socket.end();
      this.handleSocketClose(socket);
      return;
    }

    // Ping frame (opcode 9)
    if (opcode === 9) {
      this.sendPong(socket);
      return;
    }

    // Pong frame (opcode 10)
    if (opcode === 10) {
      client.isAlive = true;
      return;
    }

    // Text frame (opcode 1)
    if (opcode === 1) {
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }

      let mask = null;
      if (masked) {
        if (buf.length < offset + 4) return;
        mask = buf.slice(offset, offset + 4);
        offset += 4;
      }

      if (buf.length < offset + len) return;

      const payload = Buffer.alloc(len);
      for (let i = 0; i < len; i++) {
        payload[i] = masked ? (buf[offset + i] ^ mask[i % 4]) : buf[offset + i];
      }

      try {
        const message = JSON.parse(payload.toString('utf8'));
        this.processClientMessage(client, message);
      } catch (err) {
        // Ignore unparseable frames
      }
    }
  }

  processClientMessage(client, msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'auth':
        if (msg.userId) {
          client.userId = msg.userId;
          client.username = msg.username || 'Anonymous';
          if (!this.userSockets.has(client.userId)) {
            this.userSockets.set(client.userId, new Set());
          }
          this.userSockets.get(client.userId).add(client.socket);

          // Broadcast user online status
          this.broadcastAll({
            type: 'presence',
            userId: client.userId,
            username: client.username,
            status: 'online'
          });

          this.send(client.socket, { type: 'auth_success', userId: client.userId });
        }
        break;

      case 'join_room':
        if (msg.room) {
          this.joinRoom(client.socket, msg.room);
          this.send(client.socket, { type: 'joined_room', room: msg.room });
        }
        break;

      case 'leave_room':
        if (msg.room) {
          this.leaveRoom(client.socket, msg.room);
          this.send(client.socket, { type: 'left_room', room: msg.room });
        }
        break;

      case 'chat_message':
        if (msg.room && msg.content) {
          this.broadcastRoom(msg.room, {
            type: 'chat_message',
            room: msg.room,
            senderId: client.userId,
            senderName: client.username,
            content: msg.content,
            attachments: msg.attachments || [],
            timestamp: Date.now()
          });
        }
        break;

      case 'typing':
        if (msg.room && client.userId) {
          this.broadcastRoom(
            msg.room,
            {
              type: 'typing',
              room: msg.room,
              userId: client.userId,
              username: client.username,
              isTyping: Boolean(msg.isTyping)
            },
            client.socket
          );
        }
        break;

      // WebRTC Voice Signaling: Offer, Answer, ICE Candidate
      case 'webrtc_offer':
      case 'webrtc_answer':
      case 'webrtc_candidate':
      case 'voice_join':
      case 'voice_leave':
        if (msg.room) {
          this.broadcastRoom(
            msg.room,
            {
              ...msg,
              senderId: client.userId,
              senderName: client.username
            },
            client.socket
          );
        }
        break;

      default:
        this.emit('message', client, msg);
        break;
    }
  }

  joinRoom(socket, room) {
    const client = this.clients.get(socket);
    if (!client) return;

    client.rooms.add(room);
    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room).add(socket);
  }

  leaveRoom(socket, room) {
    const client = this.clients.get(socket);
    if (client) client.rooms.delete(room);

    const roomSet = this.rooms.get(room);
    if (roomSet) {
      roomSet.delete(socket);
      if (roomSet.size === 0) {
        this.rooms.delete(room);
      }
    }
  }

  broadcastRoom(room, data, excludeSocket = null) {
    const sockets = this.rooms.get(room);
    if (!sockets) return;

    for (const socket of sockets) {
      if (socket !== excludeSocket) {
        this.send(socket, data);
      }
    }
  }

  broadcastAll(data, excludeSocket = null) {
    for (const [socket] of this.clients.entries()) {
      if (socket !== excludeSocket) {
        this.send(socket, data);
      }
    }
  }

  sendToUser(userId, data) {
    const userSockets = this.userSockets.get(userId);
    if (!userSockets) return;
    for (const socket of userSockets) {
      this.send(socket, data);
    }
  }

  send(socket, data) {
    try {
      const payloadStr = typeof data === 'string' ? data : JSON.stringify(data);
      const payload = Buffer.from(payloadStr, 'utf8');
      let header;

      if (payload.length < 126) {
        header = Buffer.from([0x81, payload.length]);
      } else if (payload.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(payload.length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
      }

      socket.write(Buffer.concat([header, payload]));
    } catch (err) {
      this.handleSocketClose(socket);
    }
  }

  sendPong(socket) {
    try {
      socket.write(Buffer.from([0x8a, 0x00]));
    } catch (err) {
      this.handleSocketClose(socket);
    }
  }

  handleSocketClose(socket) {
    const client = this.clients.get(socket);
    if (!client) return;

    // Leave all rooms
    for (const room of client.rooms) {
      this.leaveRoom(socket, room);
    }

    // Remove from user sockets
    if (client.userId && this.userSockets.has(client.userId)) {
      const set = this.userSockets.get(client.userId);
      set.delete(socket);
      if (set.size === 0) {
        this.userSockets.delete(client.userId);
        // Broadcast user offline status
        this.broadcastAll({
          type: 'presence',
          userId: client.userId,
          status: 'offline'
        });
      }
    }

    this.clients.delete(socket);
  }

  setupHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      for (const [socket, client] of this.clients.entries()) {
        if (!client.isAlive) {
          socket.destroy();
          this.handleSocketClose(socket);
          continue;
        }
        client.isAlive = false;
        try {
          // Send ping (opcode 9)
          socket.write(Buffer.from([0x89, 0x00]));
        } catch (err) {
          socket.destroy();
          this.handleSocketClose(socket);
        }
      }
    }, 30000).unref();
  }

  close() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const [socket] of this.clients.entries()) {
      socket.destroy();
    }
    this.clients.clear();
    this.rooms.clear();
    this.userSockets.clear();
  }
}

function attachRealtime(server, options = {}) {
  return new RealtimeHub(server, options);
}

module.exports = {
  RealtimeHub,
  attachRealtime
};
