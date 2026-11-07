'use strict';

/**
 * Insaybook — Full REST API & Community Controller
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

      const existing = db.get('SELECT id FROM users WHERE username = ? OR email = ?', username, email);
      if (existing) {
        return sendJson(res, 409, { ok: false, error: 'Username or email already in use.' });
      }

      const { hash, salt } = hashPassword(password);
      const userId = 'usr_' + crypto.randomUUID().slice(0, 12);
      const avatarUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%232875df"/><text x="50" y="62" font-size="40" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">${username.slice(0, 2).toUpperCase()}</text></svg>`;

      db.run(
        `INSERT INTO users (id, username, email, password_hash, salt, display_name, avatar_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, username, email, hash, salt, displayName, avatarUrl, Date.now()
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
          coverUrl: user.cover_url,
          hometown: user.hometown,
          occupation: user.occupation
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
    return sendJson(res, 200, { ok: true, message: 'Logged out successfully.' });
  });

  router.get('/api/auth/me', (req, res) => {
    const user = getAuthUser(db, req);
    if (!user) return sendJson(res, 200, { ok: true, user: null });
    const full = db.get('SELECT id, username, email, display_name, bio, avatar_url, cover_url, hometown, occupation FROM users WHERE id = ?', user.id);
    const pendingFriends = db.get('SELECT COUNT(*) as count FROM friendships WHERE addressee_id = ? AND status = "pending"', user.id).count;
    return sendJson(res, 200, { ok: true, user: full, pendingFriends });
  });

  // ==================== FEED & POSTS ====================
  router.get('/api/feed', (req, res, url) => {
    const user = getAuthUser(db, req);
    const q = getQuery(url);
    const filter = q.filter || 'recent'; // 'recent', 'friends', 'group'
    const groupId = q.groupId;
    const search = (q.search || '').trim().toLowerCase();

    let sql = `
      SELECT p.*, u.username, u.display_name, u.avatar_url,
             g.name as group_name,
             (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) as comment_count,
             ${user ? `(SELECT reaction FROM post_reactions WHERE post_id = p.id AND user_id = '${user.id}')` : 'NULL'} as my_reaction
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN groups g ON p.group_id = g.id
    `;

    const whereClauses = [];
    const params = [];

    if (groupId) {
      whereClauses.push('p.group_id = ?');
      params.push(groupId);
    } else if (filter === 'friends' && user) {
      whereClauses.push(`p.user_id IN (
        SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
        FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
      )`);
      params.push(user.id, user.id, user.id);
    }

    if (search) {
      whereClauses.push('(LOWER(p.content) LIKE ? OR LOWER(u.display_name) LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    sql += ' ORDER BY p.created_at DESC LIMIT 40';

    const posts = db.all(sql, ...params);

    for (const post of posts) {
      // Reaction breakdown
      const reactions = db.all('SELECT reaction, COUNT(*) as count FROM post_reactions WHERE post_id = ? GROUP BY reaction', post.id);
      post.reactions = {};
      let totalReactions = 0;
      for (const r of reactions) {
        post.reactions[r.reaction] = r.count;
        totalReactions += r.count;
      }
      post.reaction_count = totalReactions;
    }

    return sendJson(res, 200, { ok: true, posts });
  });

  router.post('/api/posts', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const content = escapeHtml((body.content || '').trim()).slice(0, 3000);
      const groupId = body.groupId || null;
      const mediaUrl = (body.mediaUrl || '').trim();
      const mediaType = body.mediaType || (mediaUrl ? 'image' : 'none');
      const audience = body.audience || 'public';

      if (!content && !mediaUrl) {
        return sendJson(res, 400, { ok: false, error: 'Post must have content or media.' });
      }

      const postId = 'bk_post_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.run(
        'INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        postId, user.id, groupId, content, mediaUrl, mediaType, audience, now
      );

      if (realtime) {
        realtime.broadcastAll({
          type: 'new_insaybook_post',
          post: { id: postId, userId: user.id, username: user.username, content }
        });
      }

      return sendJson(res, 201, { ok: true, postId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/posts/:id/react', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const postId = matches[1];

    try {
      const body = await readJsonBody(req);
      const reaction = (body.reaction || 'like').toLowerCase();
      const validReactions = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];
      if (!validReactions.includes(reaction)) {
        return sendJson(res, 400, { ok: false, error: 'Invalid reaction type' });
      }

      const existing = db.get('SELECT reaction FROM post_reactions WHERE post_id = ? AND user_id = ?', postId, user.id);
      let myReaction = reaction;

      if (existing) {
        if (existing.reaction === reaction) {
          // Toggle off
          db.run('DELETE FROM post_reactions WHERE post_id = ? AND user_id = ?', postId, user.id);
          myReaction = null;
        } else {
          // Update reaction
          db.run('UPDATE post_reactions SET reaction = ? WHERE post_id = ? AND user_id = ?', reaction, postId, user.id);
        }
      } else {
        db.run('INSERT INTO post_reactions VALUES (?, ?, ?, ?)', postId, user.id, reaction, Date.now());
      }

      const reactions = db.all('SELECT reaction, COUNT(*) as count FROM post_reactions WHERE post_id = ? GROUP BY reaction', postId);
      const reactionCounts = {};
      let total = 0;
      for (const r of reactions) {
        reactionCounts[r.reaction] = r.count;
        total += r.count;
      }

      return sendJson(res, 200, { ok: true, myReaction, reactionCounts, totalReactions: total });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.get('/api/posts/:id/comments', (req, res, url, matches) => {
    const postId = matches[1];
    const comments = db.all(
      `SELECT c.*, u.username, u.display_name, u.avatar_url
       FROM post_comments c
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
      if (!text) return sendJson(res, 400, { ok: false, error: 'Comment cannot be empty.' });

      const commentId = 'cm_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.run('INSERT INTO post_comments VALUES (?, ?, ?, ?, ?)', commentId, postId, user.id, text, now);

      return sendJson(res, 201, {
        ok: true,
        comment: {
          id: commentId,
          postId,
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

  // ==================== FRIENDS & RELATIONSHIPS ====================
  router.get('/api/friends', (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    // Accepted friends
    const friends = db.all(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.hometown, u.occupation
       FROM friendships f
       JOIN users u ON (CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END) = u.id
       WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'`,
      user.id, user.id, user.id
    );

    // Incoming pending requests
    const incomingRequests = db.all(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, f.created_at
       FROM friendships f
       JOIN users u ON f.requester_id = u.id
       WHERE f.addressee_id = ? AND f.status = 'pending'`,
      user.id
    );

    return sendJson(res, 200, { ok: true, friends, incomingRequests });
  });

  router.post('/api/friends/request/:targetId', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const targetId = matches[1];

    if (user.id === targetId) return sendJson(res, 400, { ok: false, error: 'Cannot friend yourself.' });

    const existing = db.get(
      'SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)',
      user.id, targetId, targetId, user.id
    );

    if (existing) {
      return sendJson(res, 400, { ok: false, error: `Relationship already exists (status: ${existing.status})` });
    }

    const now = Date.now();
    db.run('INSERT INTO friendships VALUES (?, ?, ?, ?, ?)', user.id, targetId, 'pending', now, now);

    return sendJson(res, 201, { ok: true, message: 'Friend request sent.' });
  });

  router.post('/api/friends/respond/:requesterId', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const requesterId = matches[1];

    try {
      const body = await readJsonBody(req);
      const action = body.action === 'accept' ? 'accepted' : 'declined';
      const now = Date.now();

      db.run('UPDATE friendships SET status = ?, updated_at = ? WHERE requester_id = ? AND addressee_id = ?', action, now, requesterId, user.id);

      return sendJson(res, 200, { ok: true, status: action });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== GROUPS ====================
  router.get('/api/groups', (req, res) => {
    const user = getAuthUser(db, req);
    const groups = db.all(
      `SELECT g.*, u.display_name as creator_name,
              (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
              ${user ? `(SELECT role FROM group_members WHERE group_id = g.id AND user_id = '${user.id}')` : 'NULL'} as my_role
       FROM groups g
       JOIN users u ON g.creator_id = u.id
       ORDER BY member_count DESC`
    );
    return sendJson(res, 200, { ok: true, groups });
  });

  router.post('/api/groups', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const name = escapeHtml((body.name || '').trim()).slice(0, 80);
      const description = escapeHtml((body.description || '').trim()).slice(0, 500);
      const privacy = body.privacy === 'private' ? 'private' : 'public';

      if (!name) return sendJson(res, 400, { ok: false, error: 'Group name is required.' });

      const groupId = 'grp_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.transaction(tx => {
        tx.run('INSERT INTO groups VALUES (?, ?, ?, ?, ?, ?, ?, ?)', groupId, user.id, name, description, privacy, '', '', now);
        tx.run('INSERT INTO group_members VALUES (?, ?, ?, ?)', groupId, user.id, 'admin', now);
      });

      return sendJson(res, 201, { ok: true, groupId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/groups/:id/join', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const groupId = matches[1];

    const existing = db.get('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', groupId, user.id);
    if (existing) return sendJson(res, 200, { ok: true, message: 'Already a member' });

    db.run('INSERT INTO group_members VALUES (?, ?, ?, ?)', groupId, user.id, 'member', Date.now());
    return sendJson(res, 200, { ok: true, joined: true });
  });

  router.post('/api/groups/:id/leave', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const groupId = matches[1];

    db.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', groupId, user.id);
    return sendJson(res, 200, { ok: true, joined: false });
  });

  // ==================== EVENTS ====================
  router.get('/api/events', (req, res) => {
    const user = getAuthUser(db, req);
    const events = db.all(
      `SELECT e.*, u.display_name as creator_name,
              (SELECT COUNT(*) FROM event_rsvps WHERE event_id = e.id AND status = 'going') as going_count,
              ${user ? `(SELECT status FROM event_rsvps WHERE event_id = e.id AND user_id = '${user.id}')` : 'NULL'} as my_rsvp
       FROM events e
       JOIN users u ON e.creator_id = u.id
       ORDER BY e.event_date ASC`
    );
    return sendJson(res, 200, { ok: true, events });
  });

  router.post('/api/events', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const title = escapeHtml((body.title || '').trim()).slice(0, 100);
      const description = escapeHtml((body.description || '').trim()).slice(0, 1000);
      const location = escapeHtml((body.location || '').trim()).slice(0, 100);
      const eventDate = body.eventDate ? new Date(body.eventDate).getTime() : Date.now() + 86400000;

      if (!title || !location) return sendJson(res, 400, { ok: false, error: 'Title and location required.' });

      const eventId = 'ev_' + crypto.randomUUID().slice(0, 10);
      db.transaction(tx => {
        tx.run('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?)', eventId, user.id, title, description, location, eventDate, '', Date.now());
        tx.run('INSERT INTO event_rsvps VALUES (?, ?, ?, ?)', eventId, user.id, 'going', Date.now());
      });

      return sendJson(res, 201, { ok: true, eventId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  router.post('/api/events/:id/rsvp', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const eventId = matches[1];

    try {
      const body = await readJsonBody(req);
      const status = body.status || 'going'; // 'going', 'interested', 'not_going'

      db.run('INSERT OR REPLACE INTO event_rsvps VALUES (?, ?, ?, ?)', eventId, user.id, status, Date.now());
      return sendJson(res, 200, { ok: true, status });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== MARKETPLACE ====================
  router.get('/api/marketplace', (req, res, url) => {
    const q = getQuery(url);
    const category = q.category;
    const search = (q.search || '').trim().toLowerCase();

    let sql = `
      SELECT m.*, u.username as seller_username, u.display_name as seller_name, u.avatar_url as seller_avatar
      FROM marketplace_items m
      JOIN users u ON m.seller_id = u.id
      WHERE m.is_sold = 0
    `;
    const params = [];

    if (category && category !== 'All') {
      sql += ' AND m.category = ?';
      params.push(category);
    }
    if (search) {
      sql += ' AND (LOWER(m.title) LIKE ? OR LOWER(m.description) LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY m.created_at DESC LIMIT 50';
    const items = db.all(sql, ...params);
    return sendJson(res, 200, { ok: true, items });
  });

  router.post('/api/marketplace', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    try {
      const body = await readJsonBody(req);
      const title = escapeHtml((body.title || '').trim()).slice(0, 100);
      const description = escapeHtml((body.description || '').trim()).slice(0, 1500);
      const price = parseFloat(body.price) || 0;
      const category = escapeHtml(body.category || 'General').slice(0, 40);
      const location = escapeHtml(body.location || 'Local Pickup').slice(0, 80);
      const imageUrl = (body.imageUrl || '').trim();

      if (!title || price <= 0) return sendJson(res, 400, { ok: false, error: 'Valid title and price required.' });

      const itemId = 'mkt_' + crypto.randomUUID().slice(0, 10);
      db.run(
        'INSERT INTO marketplace_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        itemId, user.id, title, description, price, 'USD', category, location, imageUrl, 0, Date.now()
      );

      return sendJson(res, 201, { ok: true, itemId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== MESSENGER ====================
  router.get('/api/messenger/conversations', (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;

    const convUsers = db.all(
      `SELECT DISTINCT
         CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END as other_user_id
       FROM messenger_messages
       WHERE sender_id = ? OR recipient_id = ?`,
      user.id, user.id, user.id
    );

    const conversations = [];
    for (const row of convUsers) {
      const otherUser = db.get('SELECT id, username, display_name, avatar_url FROM users WHERE id = ?', row.other_user_id);
      if (!otherUser) continue;

      const lastMsg = db.get(
        `SELECT text, created_at, sender_id
         FROM messenger_messages
         WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
         ORDER BY created_at DESC LIMIT 1`,
        user.id, otherUser.id, otherUser.id, user.id
      );

      conversations.push({
        user: otherUser,
        lastMessage: lastMsg ? lastMsg.text : '',
        timestamp: lastMsg ? lastMsg.created_at : 0
      });
    }

    conversations.sort((a, b) => b.timestamp - a.timestamp);
    return sendJson(res, 200, { ok: true, conversations });
  });

  router.get('/api/messenger/:userId', (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const otherUserId = matches[1];

    const messages = db.all(
      `SELECT * FROM messenger_messages
       WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
       ORDER BY created_at ASC LIMIT 80`,
      user.id, otherUserId, otherUserId, user.id
    );

    return sendJson(res, 200, { ok: true, messages });
  });

  router.post('/api/messenger/:userId', async (req, res, url, matches) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    const recipientId = matches[1];

    try {
      const body = await readJsonBody(req);
      const text = escapeHtml((body.text || '').trim()).slice(0, 2000);
      if (!text) return sendJson(res, 400, { ok: false, error: 'Message cannot be empty.' });

      const msgId = 'msg_' + crypto.randomUUID().slice(0, 10);
      const now = Date.now();

      db.run('INSERT INTO messenger_messages VALUES (?, ?, ?, ?, ?)', msgId, user.id, recipientId, text, now);

      if (realtime) {
        realtime.sendToUser(recipientId, {
          type: 'messenger_message',
          message: { id: msgId, senderId: user.id, senderName: user.username, text, createdAt: now }
        });
      }

      return sendJson(res, 201, { ok: true, messageId: msgId, createdAt: now });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  // ==================== USER PROFILES ====================
  router.get('/api/users/:username', (req, res, url, matches) => {
    const username = matches[1].toLowerCase();
    const targetUser = db.get('SELECT id, username, email, display_name, bio, avatar_url, cover_url, hometown, occupation FROM users WHERE LOWER(username) = ?', username);
    if (!targetUser) return sendJson(res, 404, { ok: false, error: 'User not found.' });

    const posts = db.all('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC', targetUser.id);
    const friendCount = db.get(
      'SELECT COUNT(*) as count FROM friendships WHERE (requester_id = ? OR addressee_id = ?) AND status = "accepted"',
      targetUser.id, targetUser.id
    ).count;

    return sendJson(res, 200, { ok: true, user: targetUser, posts, friendCount });
  });

  // ==================== REPORTS ====================
  router.post('/api/reports', async (req, res) => {
    const user = requireAuth(db, req, res);
    if (!user) return;
    try {
      const body = await readJsonBody(req);
      const reportId = 'rep_' + crypto.randomUUID().slice(0, 10);
      db.run(
        'INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        reportId, user.id, body.targetType || 'post', body.targetId, body.reason || 'General', body.details || '', 'open', Date.now()
      );
      return sendJson(res, 201, { ok: true, reportId });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });
}

module.exports = {
  registerApiRoutes
};

