'use strict';

/**
 * Insaysnap — Full Ephemeral API & Auto-Destruct Engine
 */

const fs = require('fs');
const path = require('path');
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

function registerApiRoutes(router, db, realtime, uploadDir) {
  // ==================== BACKGROUND EXPIRATION & DISK PURGE ENGINE ====================
  // Sweeps every 3 seconds to ensure true physical deletion
  setInterval(() => {
    try {
      const now = Date.now();

      // 1. Sweep expired direct snaps
      const expiredSnaps = db.all(
        'SELECT id, media_path FROM snaps WHERE is_opened = 1 AND expires_at <= ?',
        now
      );
      for (const snap of expiredSnaps) {
        if (snap.media_path && snap.media_path.startsWith('/uploads/')) {
          const filePath = path.join(uploadDir, path.basename(snap.media_path));
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }
        }
      }
      if (expiredSnaps.length > 0) {
        db.run('DELETE FROM snaps WHERE is_opened = 1 AND expires_at <= ?', now);
      }

      // 2. Sweep expired stories (24h)
      const expiredStories = db.all('SELECT id, media_path FROM snap_stories WHERE expires_at <= ?', now);
      for (const st of expiredStories) {
        if (st.media_path && st.media_path.startsWith('/uploads/')) {
          const filePath = path.join(uploadDir, path.basename(st.media_path));
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }
        }
      }
      if (expiredStories.length > 0) {
        db.run('DELETE FROM snap_stories WHERE expires_at <= ?', now);
      }

      // 3. Sweep expired chat messages
      db.run('DELETE FROM chat_messages WHERE is_opened = 1 AND expires_at <= ?', now);
    } catch (err) {
      console.error('Ephemeral sweep error:', err.message);
    }
  }, 3000).unref();

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
      const avatarUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%23fffc00"/><text x="50" y="62" font-size="40" font-family="sans-serif" font-weight="bold" fill="%23111" text-anchor="middle">${username.slice(0, 2).toUpperCase()}</text></svg>`;

      db.run(
        `INSERT INTO users (id, username, email, password_hash, salt, display_name, avatar_url, snap_score, is_admin, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, username, email, hash, salt, displayName, avatarUrl, 10, 0, Date.now()
      );

      const session = createSession(db, userId, req.headers['user-agent'], req.socket.remoteAddress);
      sendAuthCookie(res, session.token);

      return sendJson(res, 201, {
        ok: true,
        user: { id: userId, username, email, displayName, avatarUrl, snapScore: 10 },
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
          snapScore: user.snap_score
        },
        token: session.token
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/auth/logout', (req, res) => {
    const user = getAuthUser(db, req);
    if (user && user.sessionToken) destroySession(db, user.sessionToken);
    clearAuthCookie(res);
    return sendJson(res, 200, { ok: true, message: 'Logged out.' });
  });

  router.get('/api/auth/me', (req, res) => {
    const user = getAuthUser(db, req);
    if (!user) return sendJson(res, 200, { ok: true, user: null });
    const full = db.get('SELECT id, username, email, display_name, avatar_url, snap_score FROM users WHERE id = ?', user.id);
    const unopenedSnaps = db.get('SELECT COUNT(*) as count FROM snaps WHERE recipient_id = ? AND is_opened = 0', user.id).count;
    return sendJson(res, 200, { ok: true, user: full, unopenedSnaps });
  });

  // ==================== EPHEMERAL SNAPS ====================
  router.get('/api/snaps/inbox', (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    const inbox = db.all(
      `SELECT s.id, s.sender_id, s.recipient_id, s.media_type, s.caption, s.duration_seconds,
              s.is_opened, s.opened_at, s.expires_at, s.created_at,
              u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar
       FROM snaps s
       JOIN users u ON s.sender_id = u.id
       WHERE s.recipient_id = ?
       ORDER BY s.is_opened ASC, s.created_at DESC`,
      user.id
    );

    return sendJson(res, 200, { ok: true, inbox });
  });

  router.post('/api/snaps', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const recipientId = body.recipientId;
      const mediaPath = (body.mediaPath || '').trim();
      const mediaType = body.mediaType || 'image';
      const caption = escapeHtml((body.caption || '').trim()).slice(0, 300);
      const durationSeconds = Math.min(Math.max(parseInt(body.durationSeconds, 10) || 5, 1), 10);

      if (!recipientId || !mediaPath) {
        return sendJson(res, 400, { ok: false, error: 'Recipient and media required.' });
      }

      const snapId = 'snap_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.transaction(tx => {
        tx.run(
          'INSERT INTO snaps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          snapId, user.id, recipientId, mediaPath, mediaType, caption, durationSeconds, 0, null, null, now
        );
        // Increment snap scores
        tx.run('UPDATE users SET snap_score = snap_score + 1 WHERE id = ?', user.id);
        tx.run('UPDATE users SET snap_score = snap_score + 1 WHERE id = ?', recipientId);

        // Update streaks if friends
        tx.run(
          `UPDATE friends SET streak_count = streak_count + 1, last_snap_at = ?
           WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)`,
          now, user.id, recipientId, recipientId, user.id
        );
      });

      if (realtime) {
        realtime.sendToUser(recipientId, {
          type: 'new_snap',
          snap: { id: snapId, senderId: user.id, senderName: user.username, mediaType, durationSeconds }
        });
      }

      return sendJson(res, 201, { ok: true, snapId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/snaps/:id/open', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const snapId = matches[1];

    const snap = db.get('SELECT * FROM snaps WHERE id = ? AND recipient_id = ?', snapId, user.id);
    if (!snap) return sendJson(res, 404, { ok: false, error: 'Snap not found or already purged.' });

    if (snap.is_opened && snap.expires_at <= Date.now()) {
      return sendJson(res, 410, { ok: false, error: 'Snap expired and permanently purged from server.' });
    }

    const now = Date.now();
    const expiresAt = now + snap.duration_seconds * 1000;

    if (!snap.is_opened) {
      db.run('UPDATE snaps SET is_opened = 1, opened_at = ?, expires_at = ? WHERE id = ?', now, expiresAt, snapId);
    }

    return sendJson(res, 200, {
      ok: true,
      mediaPath: snap.media_path,
      mediaType: snap.media_type,
      caption: snap.caption,
      durationSeconds: snap.duration_seconds,
      expiresAt
    });
  });

  router.post('/api/snaps/:id/consumed', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const snapId = matches[1];

    // Immediate deletion upon playback consumption
    const snap = db.get('SELECT media_path FROM snaps WHERE id = ? AND recipient_id = ?', snapId, user.id);
    if (snap && snap.media_path && snap.media_path.startsWith('/uploads/')) {
      const filePath = path.join(uploadDir, path.basename(snap.media_path));
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (e) {}
      }
    }

    db.run('DELETE FROM snaps WHERE id = ?', snapId);
    return sendJson(res, 200, { ok: true, message: 'Snap physically purged from server disk and database.' });
  });

  // ==================== STORIES ====================
  router.get('/api/stories', (req, res) => {
    const user = getAuthUser(db, req);
    const now = Date.now();

    const stories = db.all(
      `SELECT s.*, u.username, u.display_name, u.avatar_url,
              ${user ? `(SELECT 1 FROM story_views WHERE story_id = s.id AND viewer_id = '${user.id}')` : '0'} as is_viewed
       FROM snap_stories s
       JOIN users u ON s.user_id = u.id
       WHERE s.expires_at > ?
       ORDER BY s.created_at ASC`,
      now
    );

    const grouped = {};
    for (const st of stories) {
      if (!grouped[st.user_id]) {
        grouped[st.user_id] = {
          userId: st.user_id,
          username: st.username,
          displayName: st.display_name,
          avatarUrl: st.avatar_url,
          allViewed: true,
          stories: []
        };
      }
      const isViewed = Boolean(st.is_viewed);
      if (!isViewed) grouped[st.user_id].allViewed = false;
      grouped[st.user_id].stories.push({
        id: st.id,
        mediaPath: st.media_path,
        mediaType: st.media_type,
        caption: st.caption,
        expiresAt: st.expires_at,
        isViewed
      });
    }

    return sendJson(res, 200, { ok: true, stories: Object.values(grouped) });
  });

  router.post('/api/stories', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const mediaPath = (body.mediaPath || '').trim();
      const mediaType = body.mediaType || 'image';
      const caption = escapeHtml((body.caption || '').trim()).slice(0, 300);

      if (!mediaPath) return sendJson(res, 400, { ok: false, error: 'Media required.' });

      const storyId = 'sn_st_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();
      const expiresAt = now + 24 * 3600 * 1000; // 24h

      db.run('INSERT INTO snap_stories VALUES (?, ?, ?, ?, ?, ?, ?)', storyId, user.id, mediaPath, mediaType, caption, expiresAt, now);

      return sendJson(res, 201, { ok: true, storyId, expiresAt });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== MEMORIES (Permanent Vault) ====================
  router.get('/api/memories', (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    const memories = db.all('SELECT * FROM memories WHERE user_id = ? ORDER BY created_at DESC', user.id);
    return sendJson(res, 200, { ok: true, memories });
  });

  router.post('/api/memories', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const mediaPath = (body.mediaPath || '').trim();
      const mediaType = body.mediaType || 'image';
      const caption = escapeHtml((body.caption || '').trim()).slice(0, 300);

      if (!mediaPath) return sendJson(res, 400, { ok: false, error: 'Media required.' });

      const memoryId = 'mem_' + crypto.randomUUID().slice(0, 10);
      db.run('INSERT INTO memories VALUES (?, ?, ?, ?, ?, ?)', memoryId, user.id, mediaPath, mediaType, caption, Date.now());

      return sendJson(res, 201, { ok: true, memoryId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== FRIENDS & STREAKS ====================
  router.get('/api/friends', (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    const friends = db.all(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.snap_score,
              f.streak_count, f.last_snap_at
       FROM friends f
       JOIN users u ON (CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END) = u.id
       WHERE f.user_a = ? OR f.user_b = ?
       ORDER BY f.streak_count DESC`,
      user.id, user.id, user.id
    );

    return sendJson(res, 200, { ok: true, friends });
  });

  router.post('/api/friends/request/:targetId', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const targetId = matches[1];

    if (user.id === targetId) return sendJson(res, 400, { ok: false, error: 'Cannot add yourself.' });

    db.run('INSERT OR REPLACE INTO friends VALUES (?, ?, ?, ?, ?)', user.id, targetId, 1, Date.now(), Date.now());
    return sendJson(res, 201, { ok: true, message: 'Friend added with 1-day streak!' });
  });

  // ==================== EPHEMERAL CHAT ====================
  router.get('/api/chat/:userId', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const otherUserId = matches[1];

    const messages = db.all(
      `SELECT * FROM chat_messages
       WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
         AND (is_opened = 0 OR expires_at > ?)
       ORDER BY created_at ASC`,
      user.id, otherUserId, otherUserId, user.id, Date.now()
    );

    // Mark as opened with 30s auto-destruct
    db.run(
      'UPDATE chat_messages SET is_opened = 1, opened_at = ?, expires_at = ? WHERE sender_id = ? AND recipient_id = ? AND is_opened = 0',
      Date.now(), Date.now() + 30000, otherUserId, user.id
    );

    return sendJson(res, 200, { ok: true, messages });
  });

  router.post('/api/chat/:userId', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const recipientId = matches[1];

    try {
      const body = await readJsonBody(req);
      const text = escapeHtml((body.text || '').trim()).slice(0, 1000);
      if (!text) return sendJson(res, 400, { ok: false, error: 'Text required' });

      const msgId = 'cmsg_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.run('INSERT INTO chat_messages VALUES (?, ?, ?, ?, ?, ?, ?, ?)', msgId, user.id, recipientId, text, 0, null, null, now);

      if (realtime) {
        realtime.sendToUser(recipientId, {
          type: 'ephemeral_chat',
          message: { id: msgId, senderId: user.id, senderName: user.username, text, createdAt: now }
        });
      }

      return sendJson(res, 201, { ok: true, msgId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== REPORTS ====================
  router.post('/api/reports', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    try {
      const body = await readJsonBody(req);
      const repId = 'rep_' + crypto.randomUUID().slice(0, 10);
      db.run('INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?, ?, ?)', repId, user.id, body.targetType || 'snap', body.targetId, body.reason || 'General', body.details || '', 'open', Date.now());
      return sendJson(res, 201, { ok: true, repId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });
}

module.exports = {
  registerApiRoutes
};

