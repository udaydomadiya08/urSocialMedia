'use strict';

/**
 * Insaygram — Full REST API & Business Logic Controller
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
  // Helper to extract param
  const getQuery = (url) => Object.fromEntries(url.searchParams.entries());

  // Background sweep: Expire stories
  setInterval(() => {
    try {
      db.run('DELETE FROM stories WHERE expires_at < ?', Date.now());
    } catch (err) {
      console.error('Story expiration sweep error:', err.message);
    }
  }, 60000).unref();

  // ==================== AUTH ====================
  router.post('/api/auth/register', async (req, res) => {
    try {
      const body = await readJsonBody(req);
      const username = sanitizeUsername(body.username);
      const email = sanitizeEmail(body.email);
      const password = body.password;
      const displayName = escapeHtml((body.displayName || username || '').trim()).slice(0, 50);

      if (!username) return sendJson(res, 400, { ok: false, error: 'Username must be 3-30 alphanumeric characters or underscores.' });
      if (!email) return sendJson(res, 400, { ok: false, error: 'Valid email address is required.' });
      if (!password || password.length < 6) return sendJson(res, 400, { ok: false, error: 'Password must be at least 6 characters.' });

      // Check existing
      const existing = db.get('SELECT id FROM users WHERE username = ? OR email = ?', username, email);
      if (existing) {
        return sendJson(res, 409, { ok: false, error: 'Username or email already in use.' });
      }

      const { hash, salt } = hashPassword(password);
      const userId = 'usr_' + crypto.randomUUID().slice(0, 12);
      const avatarUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23d9468f"/><text x="50" y="62" font-size="40" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">${username.slice(0, 2).toUpperCase()}</text></svg>`;

      db.run(
        `INSERT INTO users (id, username, email, password_hash, salt, display_name, bio, avatar_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, username, email, hash, salt, displayName, '', avatarUrl, Date.now()
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

      if (!identifier || !password) {
        return sendJson(res, 400, { ok: false, error: 'Identifier and password are required.' });
      }

      const user = db.get(
        'SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?',
        identifier, identifier
      );

      if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
        return sendJson(res, 401, { ok: false, error: 'Invalid username/email or password.' });
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
          bio: user.bio,
          avatarUrl: user.avatar_url,
          isVerified: Boolean(user.is_verified)
        },
        token: session.token
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/auth/logout', (req, res) => {
    const user = getAuthUser(db, req);
    if (user && user.sessionToken) {
      destroySession(db, user.sessionToken);
    }
    clearAuthCookie(res);
    return sendJson(res, 200, { ok: true, message: 'Successfully logged out.' });
  });

  router.get('/api/auth/me', (req, res) => {
    const user = getAuthUser(db, req);
    if (!user) {
      return sendJson(res, 200, { ok: true, user: null });
    }
    const full = db.get('SELECT id, username, email, display_name, bio, avatar_url, is_private, is_verified FROM users WHERE id = ?', user.id);
    const unreadCount = db.get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', user.id).count;
    return sendJson(res, 200, { ok: true, user: full, unreadNotifications: unreadCount });
  });

  // ==================== POSTS & FEED ====================
  router.get('/api/posts', (req, res, url) => {
    const user = getAuthUser(db, req);
    const q = getQuery(url);
    const tab = q.tab || 'foryou'; // 'foryou', 'following', 'saved'
    const search = (q.search || '').trim().toLowerCase();

    let sql = `
      SELECT p.*, u.username, u.display_name, u.avatar_url, u.is_verified,
             (SELECT COUNT(*) FROM likes WHERE target_type = 'post' AND target_id = p.id) as like_count,
             (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
             ${user ? `(SELECT 1 FROM likes WHERE target_type = 'post' AND target_id = p.id AND user_id = '${user.id}')` : '0'} as liked_by_me,
             ${user ? `(SELECT 1 FROM saves WHERE post_id = p.id AND user_id = '${user.id}')` : '0'} as saved_by_me
      FROM posts p
      JOIN users u ON p.user_id = u.id
    `;

    const whereClauses = [];
    const params = [];

    if (user) {
      // Exclude blocked
      whereClauses.push(`p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)`);
      params.push(user.id);
    }

    if (tab === 'following') {
      if (!user) return sendJson(res, 200, { ok: true, posts: [] });
      whereClauses.push(`p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)`);
      params.push(user.id);
    } else if (tab === 'saved') {
      if (!user) return sendJson(res, 200, { ok: true, posts: [] });
      whereClauses.push(`p.id IN (SELECT post_id FROM saves WHERE user_id = ?)`);
      params.push(user.id);
    }

    if (search) {
      whereClauses.push(`(LOWER(p.caption) LIKE ? OR LOWER(u.username) LIKE ? OR LOWER(p.location) LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    sql += ' ORDER BY p.created_at DESC LIMIT 50';

    const posts = db.all(sql, ...params);

    // Attach media for each post
    for (const post of posts) {
      post.media = db.all('SELECT media_url, media_type, aspect_ratio FROM post_media WHERE post_id = ? ORDER BY sort_order ASC', post.id);
      post.liked_by_me = Boolean(post.liked_by_me);
      post.saved_by_me = Boolean(post.saved_by_me);
      post.is_verified = Boolean(post.is_verified);
    }

    return sendJson(res, 200, { ok: true, posts });
  });

  router.post('/api/posts', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const caption = escapeHtml((body.caption || '').trim()).slice(0, 2200);
      const location = escapeHtml((body.location || '').trim()).slice(0, 100);
      const mediaList = Array.isArray(body.media) ? body.media : [];

      if (mediaList.length === 0 && !caption) {
        return sendJson(res, 400, { ok: false, error: 'A post must contain either text caption or media.' });
      }

      const postId = 'post_' + crypto.randomUUID().slice(0, 12);
      const now = Date.now();

      db.transaction(tx => {
        tx.run('INSERT INTO posts VALUES (?, ?, ?, ?, ?)', postId, user.id, caption, location, now);
        mediaList.forEach((m, idx) => {
          tx.run(
            'INSERT INTO post_media VALUES (?, ?, ?, ?, ?, ?)',
            `pm_${postId}_${idx}`,
            postId,
            m.url,
            m.type || 'image',
            m.aspectRatio || 1.0,
            idx
          );
        });
      });

      // Realtime notification
      if (realtime) {
        realtime.broadcastAll({
          type: 'new_post',
          post: { id: postId, userId: user.id, username: user.username, caption }
        });
      }

      return sendJson(res, 201, { ok: true, postId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/posts/:id/like', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const postId = matches[1];

    const existing = db.get('SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?', user.id, 'post', postId);
    let liked = false;

    if (existing) {
      db.run('DELETE FROM likes WHERE id = ?', existing.id);
      liked = false;
    } else {
      db.run('INSERT INTO likes VALUES (?, ?, ?, ?, ?)', 'lk_' + crypto.randomUUID().slice(0, 10), user.id, 'post', postId, Date.now());
      liked = true;

      // Add notification to post owner
      const post = db.get('SELECT user_id FROM posts WHERE id = ?', postId);
      if (post && post.user_id !== user.id) {
        db.run(
          'INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          'notif_' + crypto.randomUUID().slice(0, 10),
          post.user_id,
          user.id,
          'like',
          postId,
          `@${user.username} liked your post.`,
          0,
          Date.now()
        );
      }
    }

    const likeCount = db.get("SELECT COUNT(*) as count FROM likes WHERE target_type = 'post' AND target_id = ?", postId).count;
    return sendJson(res, 200, { ok: true, liked, likeCount });
  });

  router.post('/api/posts/:id/save', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const postId = matches[1];

    const existing = db.get('SELECT id FROM saves WHERE user_id = ? AND post_id = ?', user.id, postId);
    let saved = false;

    if (existing) {
      db.run('DELETE FROM saves WHERE id = ?', existing.id);
      saved = false;
    } else {
      db.run('INSERT INTO saves VALUES (?, ?, ?, ?, ?)', 'sv_' + crypto.randomUUID().slice(0, 10), user.id, postId, 'All Posts', Date.now());
      saved = true;
    }

    return sendJson(res, 200, { ok: true, saved });
  });

  router.get('/api/posts/:id/comments', (req, res, url, matches) => {
    const postId = matches[1];
    const comments = db.all(
      `SELECT c.*, u.username, u.display_name, u.avatar_url
       FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.post_id = ?
       ORDER BY c.created_at ASC`,
      postId
    );
    return sendJson(res, 200, { ok: true, comments });
  });

  router.post('/api/posts/:id/comments', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const postId = matches[1];

    try {
      const body = await readJsonBody(req);
      const text = escapeHtml((body.text || '').trim()).slice(0, 1000);
      if (!text) return sendJson(res, 400, { ok: false, error: 'Comment text cannot be empty.' });

      const commentId = 'cm_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.run('INSERT INTO comments VALUES (?, ?, ?, ?, ?, ?)', commentId, user.id, postId, body.parentId || null, text, now);

      // Notify post owner
      const post = db.get('SELECT user_id FROM posts WHERE id = ?', postId);
      if (post && post.user_id !== user.id) {
        db.run(
          'INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          'notif_' + crypto.randomUUID().slice(0, 10),
          post.user_id,
          user.id,
          'comment',
          postId,
          `@${user.username} commented: "${text.slice(0, 40)}..."`,
          0,
          now
        );
      }

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

  // ==================== STORIES ====================
  router.get('/api/stories', (req, res) => {
    const user = getAuthUser(db, req);
    const now = Date.now();

    const activeStories = db.all(
      `SELECT s.*, u.username, u.display_name, u.avatar_url,
              ${user ? `(SELECT 1 FROM story_views WHERE story_id = s.id AND user_id = '${user.id}')` : '0'} as is_viewed
       FROM stories s
       JOIN users u ON s.user_id = u.id
       WHERE s.expires_at > ?
       ORDER BY s.created_at ASC`,
      now
    );

    // Group stories by creator
    const grouped = {};
    for (const story of activeStories) {
      if (!grouped[story.user_id]) {
        grouped[story.user_id] = {
          userId: story.user_id,
          username: story.username,
          displayName: story.display_name,
          avatarUrl: story.avatar_url,
          allViewed: true,
          stories: []
        };
      }
      const isViewed = Boolean(story.is_viewed);
      if (!isViewed) grouped[story.user_id].allViewed = false;
      grouped[story.user_id].stories.push({
        id: story.id,
        mediaUrl: story.media_url,
        caption: story.caption,
        createdAt: story.created_at,
        expiresAt: story.expires_at,
        isViewed
      });
    }

    return sendJson(res, 200, { ok: true, users: Object.values(grouped) });
  });

  router.post('/api/stories', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const mediaUrl = (body.mediaUrl || '').trim();
      const caption = escapeHtml((body.caption || '').trim()).slice(0, 300);

      if (!mediaUrl) return sendJson(res, 400, { ok: false, error: 'Story requires mediaUrl' });

      const storyId = 'st_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();
      const expiresAt = now + 24 * 3600 * 1000; // 24 hours expiry

      db.run('INSERT INTO stories VALUES (?, ?, ?, ?, ?, ?, ?)', storyId, user.id, mediaUrl, body.mediaType || 'image', caption, expiresAt, now);

      return sendJson(res, 201, { ok: true, storyId, expiresAt });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/stories/:id/view', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const storyId = matches[1];

    try {
      db.run('INSERT OR IGNORE INTO story_views VALUES (?, ?, ?)', storyId, user.id, Date.now());
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== REELS ====================
  router.get('/api/reels', (req, res) => {
    const user = getAuthUser(db, req);
    const reels = db.all(
      `SELECT r.*, u.username, u.display_name, u.avatar_url,
              (SELECT COUNT(*) FROM likes WHERE target_type = 'reel' AND target_id = r.id) as like_count,
              ${user ? `(SELECT 1 FROM likes WHERE target_type = 'reel' AND target_id = r.id AND user_id = '${user.id}')` : '0'} as liked_by_me
       FROM reels r
       JOIN users u ON r.user_id = u.id
       ORDER BY r.created_at DESC LIMIT 30`
    );

    for (const r of reels) {
      r.liked_by_me = Boolean(r.liked_by_me);
    }

    return sendJson(res, 200, { ok: true, reels });
  });

  router.post('/api/reels', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const videoUrl = (body.videoUrl || '').trim();
      const caption = escapeHtml((body.caption || '').trim()).slice(0, 500);
      const audioTitle = escapeHtml((body.audioTitle || 'Original Audio').trim()).slice(0, 100);

      if (!videoUrl) return sendJson(res, 400, { ok: false, error: 'Video URL required for reel.' });

      const reelId = 'reel_' + crypto.randomUUID().slice(0, 10);
      db.run('INSERT INTO reels VALUES (?, ?, ?, ?, ?, ?, ?, ?)', reelId, user.id, videoUrl, caption, audioTitle, 15, 0, Date.now());

      return sendJson(res, 201, { ok: true, reelId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== USERS & PROFILES ====================
  router.get('/api/users/:username', (req, res, url, matches) => {
    const user = getAuthUser(db, req);
    const username = matches[1].toLowerCase();

    const targetUser = db.get(
      `SELECT id, username, email, display_name, bio, avatar_url, is_verified, is_private, created_at,
              (SELECT COUNT(*) FROM posts WHERE user_id = users.id) as post_count,
              (SELECT COUNT(*) FROM follows WHERE following_id = users.id) as follower_count,
              (SELECT COUNT(*) FROM follows WHERE follower_id = users.id) as following_count,
              ${user ? `(SELECT 1 FROM follows WHERE follower_id = '${user.id}' AND following_id = users.id)` : '0'} as is_following
       FROM users
       WHERE LOWER(username) = ?`,
      username
    );

    if (!targetUser) {
      return sendJson(res, 404, { ok: false, error: 'User not found.' });
    }

    targetUser.is_following = Boolean(targetUser.is_following);
    targetUser.is_verified = Boolean(targetUser.is_verified);

    // Fetch user's post grid
    const posts = db.all(
      `SELECT p.id, p.caption, p.created_at,
              (SELECT media_url FROM post_media WHERE post_id = p.id ORDER BY sort_order ASC LIMIT 1) as thumbnail_url,
              (SELECT COUNT(*) FROM likes WHERE target_type = 'post' AND target_id = p.id) as like_count,
              (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
       FROM posts p
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      targetUser.id
    );

    return sendJson(res, 200, { ok: true, user: targetUser, posts });
  });

  router.post('/api/users/:id/follow', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const targetId = matches[1];

    if (user.id === targetId) {
      return sendJson(res, 400, { ok: false, error: 'You cannot follow yourself.' });
    }

    const existing = db.get('SELECT * FROM follows WHERE follower_id = ? AND following_id = ?', user.id, targetId);
    let following = false;

    if (existing) {
      db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', user.id, targetId);
      following = false;
    } else {
      db.run('INSERT INTO follows VALUES (?, ?, ?)', user.id, targetId, Date.now());
      following = true;

      // Notification
      db.run(
        'INSERT INTO notifications VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'notif_' + crypto.randomUUID().slice(0, 10),
        targetId,
        user.id,
        'follow',
        user.id,
        `@${user.username} started following you.`,
        0,
        Date.now()
      );
    }

    const followerCount = db.get('SELECT COUNT(*) as count FROM follows WHERE following_id = ?', targetId).count;
    return sendJson(res, 200, { ok: true, following, followerCount });
  });

  router.patch('/api/users/profile', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const displayName = escapeHtml((body.displayName || '').trim()).slice(0, 50) || user.displayName;
      const bio = escapeHtml((body.bio || '').trim()).slice(0, 250);
      const avatarUrl = (body.avatarUrl || '').trim() || user.avatarUrl;

      db.run('UPDATE users SET display_name = ?, bio = ?, avatar_url = ? WHERE id = ?', displayName, bio, avatarUrl, user.id);

      return sendJson(res, 200, {
        ok: true,
        user: { ...user, displayName, bio, avatarUrl }
      });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== DIRECT MESSAGES ====================
  router.get('/api/messages/conversations', (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    const convUsers = db.all(
      `SELECT DISTINCT
         CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END as other_user_id
       FROM direct_messages
       WHERE sender_id = ? OR recipient_id = ?`,
      user.id, user.id, user.id
    );

    const conversations = [];
    for (const row of convUsers) {
      const otherUser = db.get('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?', row.other_user_id);
      if (!otherUser) continue;

      const lastMsg = db.get(
        `SELECT text, created_at, sender_id, is_read
         FROM direct_messages
         WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
         ORDER BY created_at DESC LIMIT 1`,
        user.id, otherUser.id, otherUser.id, user.id
      );

      conversations.push({
        user: otherUser,
        lastMessage: lastMsg ? lastMsg.text : '',
        timestamp: lastMsg ? lastMsg.created_at : 0,
        unread: lastMsg && lastMsg.sender_id !== user.id && !lastMsg.is_read
      });
    }

    conversations.sort((a, b) => b.timestamp - a.timestamp);
    return sendJson(res, 200, { ok: true, conversations });
  });

  router.get('/api/messages/:userId', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const otherUserId = matches[1];

    const messages = db.all(
      `SELECT * FROM direct_messages
       WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
       ORDER BY created_at ASC LIMIT 100`,
      user.id, otherUserId, otherUserId, user.id
    );

    // Mark as read
    db.run('UPDATE direct_messages SET is_read = 1 WHERE sender_id = ? AND recipient_id = ?', otherUserId, user.id);

    return sendJson(res, 200, { ok: true, messages });
  });

  router.post('/api/messages/:userId', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const recipientId = matches[1];

    try {
      const body = await readJsonBody(req);
      const text = escapeHtml((body.text || '').trim()).slice(0, 2000);
      if (!text) return sendJson(res, 400, { ok: false, error: 'Message cannot be empty.' });

      const msgId = 'dm_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.run('INSERT INTO direct_messages VALUES (?, ?, ?, ?, ?, ?, ?)', msgId, user.id, recipientId, text, '', 0, now);

      // Realtime forward
      if (realtime) {
        realtime.sendToUser(recipientId, {
          type: 'direct_message',
          message: { id: msgId, senderId: user.id, senderName: user.username, text, createdAt: now }
        });
      }

      return sendJson(res, 201, { ok: true, messageId: msgId, createdAt: now });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== EXPLORE & SEARCH ====================
  router.get('/api/explore', (req, res) => {
    const posts = db.all(
      `SELECT p.id, p.caption,
              (SELECT media_url FROM post_media WHERE post_id = p.id LIMIT 1) as media_url,
              (SELECT COUNT(*) FROM likes WHERE target_type = 'post' AND target_id = p.id) as like_count,
              (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
              u.username
       FROM posts p
       JOIN users u ON p.user_id = u.id
       ORDER BY like_count DESC, p.created_at DESC LIMIT 30`
    );
    return sendJson(res, 200, { ok: true, items: posts });
  });

  // ==================== REPORTS & MODERATION ====================
  router.post('/api/reports', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const targetType = body.targetType || 'post';
      const targetId = body.targetId;
      const reason = escapeHtml(body.reason || 'Spam or inappropriate').slice(0, 100);
      const details = escapeHtml(body.details || '').slice(0, 500);

      if (!targetId) return sendJson(res, 400, { ok: false, error: 'targetId is required' });

      const reportId = 'rep_' + crypto.randomUUID().slice(0, 10);
      db.run('INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?, ?, ?)', reportId, user.id, targetType, targetId, reason, details, 'open', Date.now());

      return sendJson(res, 201, { ok: true, reportId, message: 'Report submitted for review.' });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });
}

module.exports = {
  registerApiRoutes
};

