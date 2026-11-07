'use strict';

/**
 * Insay Social Ecosystem — Authentication & Session Manager
 * Cryptographically secure scrypt hashing, timing-safe verification,
 * session lifecycle management, and server-side authorization guards.
 */

const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;
const DEFAULT_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return {
    hash: derivedKey.toString('hex'),
    salt
  };
}

function verifyPassword(password, storedHash, storedSalt) {
  if (!password || !storedHash || !storedSalt) return false;
  try {
    const keyToVerify = crypto.scryptSync(password, storedSalt, SCRYPT_KEYLEN);
    const storedBuffer = Buffer.from(storedHash, 'hex');
    if (keyToVerify.length !== storedBuffer.length) return false;
    return crypto.timingSafeEqual(keyToVerify, storedBuffer);
  } catch (err) {
    return false;
  }
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(db, userId, userAgent = '', ip = '', durationMs = DEFAULT_SESSION_DURATION_MS) {
  const token = generateToken();
  const now = Date.now();
  const expiresAt = now + durationMs;

  db.run(
    `INSERT INTO sessions (id, user_id, user_agent, ip, expires_at, created_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    token,
    userId,
    userAgent.slice(0, 255),
    ip.slice(0, 64),
    expiresAt,
    now,
    now
  );

  return { token, expiresAt };
}

function validateSession(db, token) {
  if (!token || typeof token !== 'string') return null;

  const session = db.get(
    `SELECT s.*, u.id as user_id, u.username, u.email, u.display_name, u.avatar_url, u.is_admin
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = ?`,
    token
  );

  if (!session) return null;

  const now = Date.now();
  if (session.expires_at < now) {
    // Session expired; clean up
    db.run('DELETE FROM sessions WHERE id = ?', token);
    return null;
  }

  // Update last active timestamp
  db.run('UPDATE sessions SET last_active_at = ? WHERE id = ?', now, token);

  return {
    id: session.user_id,
    username: session.username,
    email: session.email,
    displayName: session.display_name,
    avatarUrl: session.avatar_url,
    isAdmin: Boolean(session.is_admin),
    sessionToken: token
  };
}

function destroySession(db, token) {
  if (!token) return false;
  const res = db.run('DELETE FROM sessions WHERE id = ?', token);
  return res && res.changes > 0;
}

function destroyAllUserSessions(db, userId) {
  db.run('DELETE FROM sessions WHERE user_id = ?', userId);
}

function extractToken(req) {
  // 1. Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. Cookie: insay_session=<token>
  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('insay_session=')) {
        return cookie.slice(14).trim();
      }
    }
  }

  return null;
}

function getAuthUser(db, req) {
  const token = extractToken(req);
  if (!token) return null;
  return validateSession(db, token);
}

function requireAuth(db, req, res) {
  const user = getAuthUser(db, req);
  if (!user) {
    res.writeHead(401, {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    });
    res.end(JSON.stringify({ ok: false, error: 'Unauthorized: Authentication required.' }));
    return null;
  }
  return user;
}

function sendAuthCookie(res, token, maxAgeSeconds = 30 * 24 * 3600) {
  res.setHeader('Set-Cookie', [
    `insay_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`
  ]);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', [
    'insay_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ]);
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  createSession,
  validateSession,
  destroySession,
  destroyAllUserSessions,
  extractToken,
  getAuthUser,
  requireAuth,
  sendAuthCookie,
  clearAuthCookie
};
