'use strict';

/**
 * Insay Social Ecosystem — Security Middleware & Validation Controls
 * CSP, Anti-Clickjacking, Strict Path Traversal Guards, Sliding-Window Throttling,
 * and Request Body Bounding.
 */

const path = require('path');

const CSP_HEADER_VALUE = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

function applySecurityHeaders(res, isApi = false) {
  res.setHeader('Content-Security-Policy', CSP_HEADER_VALUE);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  if (isApi) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}

function createRateLimiter(windowMs = 60000, maxReqs = 120) {
  const map = new Map();

  // Periodic cleanup
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of map.entries()) {
      if (now - entry.windowStart > windowMs) {
        map.delete(ip);
      }
    }
  }, windowMs).unref();

  return function checkLimit(ip) {
    const now = Date.now();
    const entry = map.get(ip);
    if (!entry || now - entry.windowStart > windowMs) {
      map.set(ip, { windowStart: now, count: 1 });
      return { allowed: true, remaining: maxReqs - 1 };
    }
    entry.count += 1;
    if (entry.count > maxReqs) {
      return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: maxReqs - entry.count };
  };
}

function getClientIp(req) {
  const forwarded = req && req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return (req && req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function sanitizeUsername(username) {
  if (typeof username !== 'string') return null;
  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(clean)) return null;
  return clean;
}

function sanitizeEmail(email) {
  if (typeof email !== 'string') return null;
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 254) return null;
  return clean;
}

function safeFilePath(rootDir, requestedPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestedPath);
  } catch (err) {
    return null;
  }

  // Reject null bytes, backslashes, control characters, and any directory traversal tokens
  if (/[\x00-\x1f\x7f\\]/.test(decoded) || decoded.includes('..')) {
    return null;
  }

  // Strip leading slashes to resolve strictly relative to rootDir
  const rel = decoded.replace(/^\/+/, '');
  const fullPath = path.resolve(rootDir, rel);

  // Must strictly stay within rootDir
  if (!fullPath.startsWith(rootDir + path.sep) && fullPath !== rootDir) {
    return null;
  }

  // Reject dotfiles (e.g. .env, .git)
  const segments = fullPath.split(path.sep);
  if (segments.some(seg => seg.startsWith('.') && seg !== '.' && seg !== '..')) {
    return null;
  }

  return fullPath;
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let bytesReceived = 0;
    const chunks = [];

    req.on('data', chunk => {
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        req.destroy();
        reject(new Error(`Payload Too Large: Exceeded ${maxBytes} bytes limit.`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const bodyStr = Buffer.concat(chunks).toString('utf8');
        const parsed = JSON.parse(bodyStr);
        resolve(parsed);
      } catch (err) {
        reject(new Error('Invalid JSON payload: ' + err.message));
      }
    });

    req.on('error', err => reject(err));
  });
}

function sendJson(res, statusCode, data) {
  applySecurityHeaders(res, true);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(data));
}

module.exports = {
  applySecurityHeaders,
  createRateLimiter,
  getClientIp,
  escapeHtml,
  sanitizeUsername,
  sanitizeEmail,
  safeFilePath,
  readJsonBody,
  sendJson
};
