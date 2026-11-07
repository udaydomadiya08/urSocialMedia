'use strict';

/**
 * Insaycord — Real-Time Community Communication Production Server
 * Port: 4177 (configurable via PORT)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const { createDatabase } = require('./src/server/core/db.js');
const { applySecurityHeaders, createRateLimiter, getClientIp, safeFilePath, sendJson } = require('./src/server/core/security.js');
const { handleFileUpload, serveMediaFile } = require('./src/server/core/uploads.js');
const { attachRealtime } = require('./src/server/core/realtime.js');
const { MIGRATIONS, seedDatabase } = require('./src/server/schema.js');
const { registerApiRoutes } = require('./src/server/api.js');

const ROOT_DIR = __dirname;
const DB_PATH = path.join(ROOT_DIR, 'data', 'insaycord.db');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const PORT = process.env.PORT || 4177;

// Initialize Database
const db = createDatabase(DB_PATH);
db.runMigrations(MIGRATIONS);
seedDatabase(db);

const checkRateLimit = createRateLimiter(60000, 240);

const routes = {
  GET: [],
  POST: [],
  PATCH: [],
  DELETE: []
};

const router = {
  get: (pattern, handler) => routes.GET.push({ regex: pathToRegex(pattern), handler }),
  post: (pattern, handler) => routes.POST.push({ regex: pathToRegex(pattern), handler }),
  patch: (pattern, handler) => routes.PATCH.push({ regex: pathToRegex(pattern), handler }),
  delete: (pattern, handler) => routes.DELETE.push({ regex: pathToRegex(pattern), handler })
};

function pathToRegex(pathStr) {
  const parts = pathStr.split('/');
  const pattern = parts
    .map(p => (p.startsWith(':') ? '([^/]+)' : p))
    .join('/');
  return new RegExp('^' + pattern + '$');
}

const server = http.createServer(async (req, res) => {
  const clientIp = getClientIp(req);
  const rateStatus = checkRateLimit(clientIp);
  if (!rateStatus.allowed) {
    applySecurityHeaders(res, true);
    res.writeHead(429, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: 'Too Many Requests.' }));
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Traversal & dotfile guard
  if (req.url.includes('..') || pathname.includes('..') || pathname.startsWith('/.') || pathname.includes('/.')) {
    applySecurityHeaders(res);
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('Forbidden');
  }

  if (pathname === '/health') {
    applySecurityHeaders(res, true);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, platform: 'insaycord', version: '1.0.0', mode: 'production' }));
  }

  if (pathname.startsWith('/uploads/')) {
    const filename = path.basename(pathname);
    const mediaPath = path.join(UPLOAD_DIR, filename);
    return serveMediaFile(mediaPath, req, res);
  }

  if (pathname === '/api/upload' && method === 'POST') {
    try {
      const result = await handleFileUpload(req, UPLOAD_DIR, {
        maxBytes: 25 * 1024 * 1024,
        allowedCategories: ['image', 'video']
      });
      return sendJson(res, 201, { ok: true, ...result });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  const methodRoutes = routes[method] || [];
  for (const r of methodRoutes) {
    const match = pathname.match(r.regex);
    if (match) {
      return r.handler(req, res, parsedUrl, match);
    }
  }

  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, { ok: false, error: 'API endpoint not found' });
  }

  let targetFile = pathname;
  if (targetFile === '/') targetFile = '/index.html';

  const fullPath = safeFilePath(ROOT_DIR, targetFile);
  if (!fullPath) {
    applySecurityHeaders(res);
    res.writeHead(403, { 'content-type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      applySecurityHeaders(res);
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end('Not found');
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg'
    };

    applySecurityHeaders(res);
    res.writeHead(200, {
      'content-type': contentTypes[ext] || 'application/octet-stream',
      'content-length': stats.size,
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(fullPath).pipe(res);
  });
});

const realtime = attachRealtime(server);
registerApiRoutes(router, db, realtime);

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[INSAYCORD] Production server running at http://127.0.0.1:${PORT}`);
  });
}

module.exports = {
  server,
  db,
  realtime
};
