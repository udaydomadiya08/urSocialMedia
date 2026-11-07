'use strict';

/**
 * Insaytok — Full REST API & Explainable Recommendation Controller
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
const { rankFeed } = require('./recommendation.js');

function registerApiRoutes(router, db, realtime) {
  const getQuery = (url) => Object.fromEntries(url.searchParams.entries());

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
      const avatarUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%2316c7c2"/><text x="50" y="62" font-size="40" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">${username.slice(0, 2).toUpperCase()}</text></svg>`;

      db.run(
        `INSERT INTO users (id, username, email, password_hash, salt, display_name, avatar_url, is_admin, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, username, email, hash, salt, displayName, avatarUrl, 0, Date.now()
      );

      const session = createSession(db, userId, req.headers['user-agent'], req.socket.remoteAddress);
      sendAuthCookie(res, session.token);

      return sendJson(res, 201, {
        ok: true,
        user: { id: userId, username, email, displayName, avatarUrl },
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
          followerCount: user.follower_count,
          followingCount: user.following_count
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
    const full = db.get('SELECT id, username, email, display_name, bio, avatar_url, follower_count, following_count FROM users WHERE id = ?', user.id);
    return sendJson(res, 200, { ok: true, user: full });
  });

  // ==================== VERTICAL VIDEO FEED & AI RECOMMENDATION ====================
  router.get('/api/feed', (req, res, url) => {
    const user = getAuthUser(db, req);
    const q = getQuery(url);
    const feedType = q.type || 'foryou'; // 'foryou', 'following'
    const tag = q.tag;
    const search = (q.search || '').trim().toLowerCase();

    let sql = `
      SELECT v.*, u.username, u.display_name, u.avatar_url,
             ${user ? `(SELECT 1 FROM video_likes WHERE video_id = v.id AND user_id = '${user.id}')` : '0'} as liked_by_me,
             ${user ? `(SELECT 1 FROM video_saves WHERE video_id = v.id AND user_id = '${user.id}')` : '0'} as saved_by_me,
             ${user ? `(SELECT 1 FROM follows WHERE follower_id = '${user.id}' AND following_id = v.user_id)` : '0'} as is_following
      FROM videos v
      JOIN users u ON v.user_id = u.id
    `;
    const params = [];
    const where = [];

    if (feedType === 'following') {
      if (!user) return sendJson(res, 200, { ok: true, videos: [] });
      where.push(`v.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)`);
      params.push(user.id);
    }

    if (tag) {
      where.push('LOWER(v.tags) LIKE ?');
      params.push(`%${tag.toLowerCase()}%`);
    }

    if (search) {
      where.push('(LOWER(v.caption) LIKE ? OR LOWER(v.tags) LIKE ? OR LOWER(u.username) LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (where.length > 0) sql += ' WHERE ' + where.join(' AND ');

    const candidateVideos = db.all(sql, ...params);

    for (const v of candidateVideos) {
      v.liked_by_me = Boolean(v.liked_by_me);
      v.saved_by_me = Boolean(v.saved_by_me);
      v.is_following = Boolean(v.is_following);
    }

    // Apply Explainable Recommendation Model
    let rankedVideos = candidateVideos;
    if (feedType === 'foryou') {
      let watchHistory = [];
      let userLikes = [];

      if (user) {
        watchHistory = db.all(
          `SELECT v.tags, v.user_id, w.completion_rate
           FROM watch_history w
           JOIN videos v ON w.video_id = v.id
           WHERE w.user_id = ?
           ORDER BY w.watched_at DESC LIMIT 30`,
          user.id
        );

        userLikes = db.all(
          `SELECT v.tags
           FROM video_likes l
           JOIN videos v ON l.video_id = v.id
           WHERE l.user_id = ?
           ORDER BY l.created_at DESC LIMIT 30`,
          user.id
        );
      }

      rankedVideos = rankFeed(candidateVideos, watchHistory, userLikes);
    }

    return sendJson(res, 200, { ok: true, videos: rankedVideos });
  });

  router.post('/api/videos', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const videoUrl = (body.videoUrl || '').trim();
      const caption = escapeHtml((body.caption || '').trim()).slice(0, 1000);
      const soundTitle = escapeHtml((body.soundTitle || 'Original Sound').trim()).slice(0, 100);

      // Extract hashtags
      const tagMatches = caption.match(/#(\w+)/g) || [];
      const extractedTags = tagMatches.map(t => t.slice(1).toLowerCase()).join(', ');
      const tags = (body.tags ? body.tags + ', ' + extractedTags : extractedTags) || 'viral, shortvideo';

      if (!videoUrl) return sendJson(res, 400, { ok: false, error: 'Video URL required.' });

      const videoId = 'tok_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.run(
        `INSERT INTO videos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        videoId, user.id, videoUrl, '', caption, tags, soundTitle, 15, 0, 0, 0, 0, now
      );

      if (realtime) {
        realtime.broadcastAll({
          type: 'new_video',
          video: { id: videoId, userId: user.id, username: user.username, caption }
        });
      }

      return sendJson(res, 201, { ok: true, videoId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/videos/:id/like', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const videoId = matches[1];

    const existing = db.get('SELECT * FROM video_likes WHERE video_id = ? AND user_id = ?', videoId, user.id);
    let liked = false;

    if (existing) {
      db.transaction(tx => {
        tx.run('DELETE FROM video_likes WHERE video_id = ? AND user_id = ?', videoId, user.id);
        tx.run('UPDATE videos SET like_count = MAX(0, like_count - 1) WHERE id = ?', videoId);
      });
      liked = false;
    } else {
      db.transaction(tx => {
        tx.run('INSERT INTO video_likes VALUES (?, ?, ?)', videoId, user.id, Date.now());
        tx.run('UPDATE videos SET like_count = like_count + 1 WHERE id = ?', videoId);
      });
      liked = true;
    }

    const likeCount = db.get('SELECT like_count FROM videos WHERE id = ?', videoId).like_count;
    return sendJson(res, 200, { ok: true, liked, likeCount });
  });

  router.post('/api/videos/:id/save', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const videoId = matches[1];

    const existing = db.get('SELECT * FROM video_saves WHERE video_id = ? AND user_id = ?', videoId, user.id);
    let saved = false;

    if (existing) {
      db.run('DELETE FROM video_saves WHERE video_id = ? AND user_id = ?', videoId, user.id);
      saved = false;
    } else {
      db.run('INSERT INTO video_saves VALUES (?, ?, ?)', videoId, user.id, Date.now());
      saved = true;
    }

    return sendJson(res, 200, { ok: true, saved });
  });

  router.get('/api/videos/:id/comments', (req, res, url, matches) => {
    const videoId = matches[1];
    const comments = db.all(
      `SELECT c.*, u.username, u.display_name, u.avatar_url
       FROM video_comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.video_id = ?
       ORDER BY c.created_at DESC`,
      videoId
    );
    return sendJson(res, 200, { ok: true, comments });
  });

  router.post('/api/videos/:id/comments', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const videoId = matches[1];

    try {
      const body = await readJsonBody(req);
      const text = escapeHtml((body.text || '').trim()).slice(0, 500);
      if (!text) return sendJson(res, 400, { ok: false, error: 'Comment required' });

      const commentId = 'cm_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.transaction(tx => {
        tx.run('INSERT INTO video_comments VALUES (?, ?, ?, ?, ?)', commentId, videoId, user.id, text, now);
        tx.run('UPDATE videos SET comment_count = comment_count + 1 WHERE id = ?', videoId);
      });

      return sendJson(res, 201, {
        ok: true,
        comment: {
          id: commentId,
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          text,
          createdAt: now
        }
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/videos/:id/watch', async (req, res, url, matches) => {
    const user = getAuthUser(db, req);
    const videoId = matches[1];

    try {
      const body = await readJsonBody(req);
      const rate = Math.min(Math.max(parseFloat(body.completionRate) || 1.0, 0.1), 1.0);

      // Increment video view count
      db.run('UPDATE videos SET view_count = view_count + 1 WHERE id = ?', videoId);

      // Record watch history if authenticated
      if (user) {
        db.run(
          'INSERT INTO watch_history VALUES (?, ?, ?, ?, ?)',
          'wh_' + crypto.randomUUID().slice(0, 10),
          user.id,
          videoId,
          rate,
          Date.now()
        );
      }

      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== DISCOVERY ====================
  router.get('/api/discover', (req, res) => {
    const trendingTags = ['science', 'diy', 'desksetup', 'animation', 'nature', '3d', 'lofi'];
    const popularCreators = db.all(
      'SELECT id, username, display_name, avatar_url, follower_count FROM users ORDER BY follower_count DESC LIMIT 5'
    );
    return sendJson(res, 200, { ok: true, trendingTags, popularCreators });
  });

  // ==================== CREATOR PROFILES & FOLLOWS ====================
  router.get('/api/users/:username', (req, res, url, matches) => {
    const user = getAuthUser(db, req);
    const username = matches[1].toLowerCase();

    const targetUser = db.get(
      `SELECT id, username, email, display_name, bio, avatar_url, follower_count, following_count,
              ${user ? `(SELECT 1 FROM follows WHERE follower_id = '${user.id}' AND following_id = users.id)` : '0'} as is_following
       FROM users WHERE LOWER(username) = ?`,
      username
    );

    if (!targetUser) return sendJson(res, 404, { ok: false, error: 'Creator not found.' });

    const videos = db.all('SELECT * FROM videos WHERE user_id = ? ORDER BY created_at DESC', targetUser.id);
    targetUser.is_following = Boolean(targetUser.is_following);

    return sendJson(res, 200, { ok: true, user: targetUser, videos });
  });

  router.post('/api/users/:id/follow', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const targetId = matches[1];

    if (user.id === targetId) return sendJson(res, 400, { ok: false, error: 'Cannot follow yourself.' });

    const existing = db.get('SELECT * FROM follows WHERE follower_id = ? AND following_id = ?', user.id, targetId);
    let following = false;

    if (existing) {
      db.transaction(tx => {
        tx.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', user.id, targetId);
        tx.run('UPDATE users SET follower_count = MAX(0, follower_count - 1) WHERE id = ?', targetId);
        tx.run('UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?', user.id);
      });
      following = false;
    } else {
      db.transaction(tx => {
        tx.run('INSERT INTO follows VALUES (?, ?, ?)', user.id, targetId, Date.now());
        tx.run('UPDATE users SET follower_count = follower_count + 1 WHERE id = ?', targetId);
        tx.run('UPDATE users SET following_count = following_count + 1 WHERE id = ?', user.id);
      });
      following = true;
    }

    const followerCount = db.get('SELECT follower_count FROM users WHERE id = ?', targetId).follower_count;
    return sendJson(res, 200, { ok: true, following, followerCount });
  });

  // ==================== REPORTS ====================
  router.post('/api/reports', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    try {
      const body = await readJsonBody(req);
      const repId = 'rep_' + crypto.randomUUID().slice(0, 10);
      db.run('INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?, ?, ?)', repId, user.id, body.targetType || 'video', body.targetId, body.reason || 'General', body.details || '', 'open', Date.now());
      return sendJson(res, 201, { ok: true, repId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });
}

module.exports = {
  registerApiRoutes
};

