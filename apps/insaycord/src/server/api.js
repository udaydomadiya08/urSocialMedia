'use strict';

/**
 * Insaycord — Full REST API & Community Chat Controller
 */

const crypto = require('crypto');
const {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getAuthUser,
  requireAuth,
  sendAuthCookie,
  clearAuthCookie
} = require('./core/auth.js');
const {
  sendJson,
  readJsonBody,
  sanitizeUsername,
  sanitizeEmail,
  escapeHtml
} = require('./core/security.js');

function registerApiRoutes(router, db, realtime) {
  const getQuery = (url) => Object.fromEntries(url.searchParams.entries());

  // Voice room in-memory state: channelId -> Map(userId -> { username, muted, deafened, joinedAt })
  const voiceRooms = new Map();

  // Helper to sync voice room state
  if (realtime) {
    realtime.on('message', (client, msg) => {
      if (msg.type === 'voice_join' && msg.channelId && client.userId) {
        if (!voiceRooms.has(msg.channelId)) voiceRooms.set(msg.channelId, new Map());
        voiceRooms.get(msg.channelId).set(client.userId, {
          userId: client.userId,
          username: client.username,
          muted: Boolean(msg.muted),
          deafened: Boolean(msg.deafened),
          joinedAt: Date.now()
        });

        // Broadcast updated room state
        const participants = Array.from(voiceRooms.get(msg.channelId).values());
        realtime.broadcastRoom(msg.channelId, {
          type: 'voice_state_update',
          channelId: msg.channelId,
          participants
        });
      } else if (msg.type === 'voice_leave' && msg.channelId && client.userId) {
        if (voiceRooms.has(msg.channelId)) {
          voiceRooms.get(msg.channelId).delete(client.userId);
          const participants = Array.from(voiceRooms.get(msg.channelId).values());
          realtime.broadcastRoom(msg.channelId, {
            type: 'voice_state_update',
            channelId: msg.channelId,
            participants
          });
        }
      }
    });
  }

  // ==================== AUTH ====================
  router.post('/api/auth/register', async (req, res) => {
    try {
      const body = await readJsonBody(req);
      const username = sanitizeUsername(body.username);
      const email = sanitizeEmail(body.email);
      const password = body.password;
      const displayName = escapeHtml((body.displayName || username || '').trim()).slice(0, 50);

      if (!username) return sendJson(res, 400, { ok: false, error: 'Username must be 3-30 alphanumeric characters.' });
      if (!email) return sendJson(res, 400, { ok: false, error: 'Valid email required.' });
      if (!password || password.length < 6) return sendJson(res, 400, { ok: false, error: 'Password minimum 6 characters.' });

      const existing = db.get('SELECT id FROM users WHERE username = ? OR email = ?', username, email);
      if (existing) return sendJson(res, 409, { ok: false, error: 'Username or email already in use.' });

      const { hash, salt } = hashPassword(password);
      const userId = 'usr_' + crypto.randomUUID().slice(0, 10);
      const avatarUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%235865f2"/><text x="50" y="62" font-size="40" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">${username.slice(0, 2).toUpperCase()}</text></svg>`;

      db.run(
        `INSERT INTO users (id, username, email, password_hash, salt, display_name, avatar_url, status, is_admin, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'online', 0, ?)`,
        userId, username, email, hash, salt, displayName, avatarUrl, Date.now()
      );

      // Auto-join default community "The Workshop"
      db.run('INSERT OR IGNORE INTO server_members VALUES (?, ?, ?, ?, ?)', 'srv_workshop', userId, '', 'member', Date.now());

      const session = createSession(db, userId, req.headers['user-agent'], req.socket.remoteAddress);
      sendAuthCookie(res, session.token);

      return sendJson(res, 201, {
        ok: true,
        user: { id: userId, username, email, displayName, avatarUrl, status: 'online' },
        token: session.token
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/auth/login', async (req, res) => {
    try {
      const body = await readJsonBody(req);
      const identifier = (body.username || body.email || '').trim().toLowerCase();
      const password = body.password || '';

      const user = db.get('SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?', identifier, identifier);
      if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
        return sendJson(res, 401, { ok: false, error: 'Invalid credentials.' });
      }

      // Mark online
      db.run("UPDATE users SET status = 'online' WHERE id = ?", user.id);

      const session = createSession(db, user.id, req.headers['user-agent'], req.socket.remoteAddress);
      sendAuthCookie(res, session.token);

      return sendJson(res, 200, {
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
          status: 'online',
          customStatus: user.custom_status
        },
        token: session.token
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/auth/logout', (req, res) => {
    const user = getAuthUser(db, req);
    if (user) {
      db.run("UPDATE users SET status = 'offline' WHERE id = ?", user.id);
      if (user.sessionToken) destroySession(db, user.sessionToken);
    }
    clearAuthCookie(res);
    return sendJson(res, 200, { ok: true, message: 'Logged out.' });
  });

  router.get('/api/auth/me', (req, res) => {
    const user = getAuthUser(db, req);
    if (!user) return sendJson(res, 200, { ok: true, user: null });
    const full = db.get('SELECT id, username, email, display_name, avatar_url, status, custom_status FROM users WHERE id = ?', user.id);
    return sendJson(res, 200, { ok: true, user: full });
  });

  // ==================== SERVERS & COMMUNITIES ====================
  router.get('/api/servers', (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    const servers = db.all(
      `SELECT s.*, sm.role as my_role, sm.nickname
       FROM servers s
       JOIN server_members sm ON s.id = sm.server_id
       WHERE sm.user_id = ?
       ORDER BY s.created_at ASC`,
      user.id
    );

    return sendJson(res, 200, { ok: true, servers });
  });

  router.post('/api/servers', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const name = escapeHtml((body.name || '').trim()).slice(0, 80);
      const description = escapeHtml((body.description || '').trim()).slice(0, 300);

      if (!name) return sendJson(res, 400, { ok: false, error: 'Server name is required.' });

      const serverId = 'srv_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.transaction(tx => {
        tx.run('INSERT INTO servers VALUES (?, ?, ?, ?, ?, ?)', serverId, user.id, name, description, '', now);
        tx.run('INSERT INTO server_members VALUES (?, ?, ?, ?, ?)', serverId, user.id, '', 'owner', now);

        // Default channels
        tx.run('INSERT INTO channels VALUES (?, ?, ?, ?, ?, ?, ?, ?)', `chn_${serverId}_gen`, serverId, 'general', 'text', 'General chatter', 0, 0, now);
        tx.run('INSERT INTO channels VALUES (?, ?, ?, ?, ?, ?, ?, ?)', `chn_${serverId}_voice`, serverId, 'Lounge Voice', 'voice', 'Voice conversation', 1, 0, now);
      });

      return sendJson(res, 201, { ok: true, serverId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.get('/api/servers/:id', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const serverId = matches[1];

    const serverInfo = db.get('SELECT * FROM servers WHERE id = ?', serverId);
    if (!serverInfo) return sendJson(res, 404, { ok: false, error: 'Server not found' });

    // Verify membership
    const membership = db.get('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?', serverId, user.id);
    if (!membership) return sendJson(res, 403, { ok: false, error: 'You are not a member of this server.' });

    const channels = db.all('SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC, created_at ASC', serverId);
    const members = db.all(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.status, u.custom_status,
              sm.role, sm.nickname, sm.joined_at
       FROM server_members sm
       JOIN users u ON sm.user_id = u.id
       WHERE sm.server_id = ?
       ORDER BY (CASE sm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'moderator' THEN 3 ELSE 4 END) ASC`,
      serverId
    );

    return sendJson(res, 200, { ok: true, server: serverInfo, channels, members, myRole: membership.role });
  });

  router.post('/api/servers/:id/channels', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const serverId = matches[1];

    try {
      const body = await readJsonBody(req);
      const name = sanitizeUsername(body.name || 'channel');
      const type = body.type === 'voice' ? 'voice' : 'text';
      const topic = escapeHtml((body.topic || '').trim()).slice(0, 200);

      if (!name) return sendJson(res, 400, { ok: false, error: 'Channel name must be alphanumeric/underscores.' });

      const channelId = `chn_${serverId}_${crypto.randomUUID().slice(0, 8)}`;
      db.run('INSERT INTO channels VALUES (?, ?, ?, ?, ?, ?, ?, ?)', channelId, serverId, name, type, topic, 10, 0, Date.now());

      return sendJson(res, 201, { ok: true, channelId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== CHANNELS & MESSAGES ====================
  router.get('/api/channels/:id/messages', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const channelId = matches[1];

    const messages = db.all(
      `SELECT m.*, u.username, u.display_name, u.avatar_url
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.channel_id = ?
       ORDER BY m.created_at ASC LIMIT 100`,
      channelId
    );

    for (const msg of messages) {
      const reactions = db.all('SELECT emoji, COUNT(*) as count FROM message_reactions WHERE message_id = ? GROUP BY emoji', msg.id);
      msg.reactions = reactions;
    }

    return sendJson(res, 200, { ok: true, messages });
  });

  router.post('/api/channels/:id/messages', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const channelId = matches[1];

    try {
      const body = await readJsonBody(req);
      const content = escapeHtml((body.content || '').trim()).slice(0, 4000);
      const mediaUrl = (body.mediaUrl || '').trim();

      if (!content && !mediaUrl) return sendJson(res, 400, { ok: false, error: 'Content required.' });

      const msgId = 'msg_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.run('INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', msgId, channelId, user.id, content, mediaUrl, 0, 0, now, now);

      const fullMsg = {
        id: msgId,
        channel_id: channelId,
        sender_id: user.id,
        content,
        media_url: mediaUrl,
        username: user.username,
        display_name: user.displayName,
        avatar_url: user.avatarUrl,
        created_at: now,
        reactions: []
      };

      if (realtime) {
        realtime.broadcastRoom(channelId, {
          type: 'channel_message',
          message: fullMsg
        });
      }

      return sendJson(res, 201, { ok: true, message: fullMsg });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.patch('/api/messages/:id', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const messageId = matches[1];

    try {
      const body = await readJsonBody(req);
      const content = escapeHtml((body.content || '').trim()).slice(0, 4000);

      const msg = db.get('SELECT * FROM messages WHERE id = ?', messageId);
      if (!msg) return sendJson(res, 404, { ok: false, error: 'Message not found' });
      if (msg.sender_id !== user.id) return sendJson(res, 403, { ok: false, error: 'Only author can edit message.' });

      db.run('UPDATE messages SET content = ?, is_edited = 1, updated_at = ? WHERE id = ?', content, Date.now(), messageId);

      if (realtime) {
        realtime.broadcastRoom(msg.channel_id, {
          type: 'message_edited',
          messageId,
          content
        });
      }

      return sendJson(res, 200, { ok: true, messageId, content });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.delete('/api/messages/:id', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const messageId = matches[1];

    const msg = db.get('SELECT * FROM messages WHERE id = ?', messageId);
    if (!msg) return sendJson(res, 404, { ok: false, error: 'Message not found' });

    // Allow author or server admin
    db.run('DELETE FROM messages WHERE id = ?', messageId);

    if (realtime) {
      realtime.broadcastRoom(msg.channel_id, {
        type: 'message_deleted',
        messageId
      });
    }

    return sendJson(res, 200, { ok: true, deleted: true });
  });

  router.post('/api/messages/:id/react', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const messageId = matches[1];

    try {
      const body = await readJsonBody(req);
      const emoji = (body.emoji || '👍').slice(0, 8);

      const existing = db.get('SELECT * FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', messageId, user.id, emoji);
      if (existing) {
        db.run('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', messageId, user.id, emoji);
      } else {
        db.run('INSERT INTO message_reactions VALUES (?, ?, ?)', messageId, user.id, emoji);
      }

      const reactions = db.all('SELECT emoji, COUNT(*) as count FROM message_reactions WHERE message_id = ? GROUP BY emoji', messageId);
      return sendJson(res, 200, { ok: true, reactions });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== VOICE ROOM SIGNALING ====================
  router.get('/api/voice/rooms/:channelId', (req, res, url, matches) => {
    const channelId = matches[1];
    const map = voiceRooms.get(channelId);
    const participants = map ? Array.from(map.values()) : [];
    return sendJson(res, 200, { ok: true, participants });
  });

  // ==================== REPORTS ====================
  router.post('/api/reports', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    try {
      const body = await readJsonBody(req);
      const repId = 'rep_' + crypto.randomUUID().slice(0, 10);
      db.run('INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?, ?, ?)', repId, user.id, body.targetType || 'message', body.targetId, body.reason || 'Spam', body.details || '', 'open', Date.now());
      return sendJson(res, 201, { ok: true, repId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });
}

module.exports = {
  registerApiRoutes
};
