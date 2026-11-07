#!/usr/bin/env node
'use strict';

/**
 * Insaysnap — Automated Verification & Ephemeral Life-Cycle Test Suite
 */

const assert = require('assert');
const http = require('http');
const { performance } = require('perf_hooks');

const { server, db } = require('../server.js');

let testPort = 0;
let passedCount = 0;
let failedCount = 0;
const results = [];

async function runTest(suite, name, fn) {
  const start = performance.now();
  try {
    await fn();
    const ms = (performance.now() - start).toFixed(2);
    passedCount++;
    results.push({ suite, name, status: 'PASS', ms });
    console.log(`  [PASS] ${suite} :: ${name} (${ms} ms)`);
  } catch (err) {
    const ms = (performance.now() - start).toFixed(2);
    failedCount++;
    results.push({ suite, name, status: 'FAIL', ms, error: err.message });
    console.error(`  [FAIL] ${suite} :: ${name} -> ${err.message}`);
  }
}

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const reqHeaders = { ...headers };
    if (postData && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: testPort,
        path,
        method,
        headers: reqHeaders
      },
      res => {
        let data = '';
        res.on('data', chunk => (data += chunk));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, headers: res.headers, raw: data, json });
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runAll() {
  console.log('======================================================');
  console.log(' INSAYSNAP Ephemeral Verification Suite');
  console.log('======================================================\n');

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      testPort = server.address().port;
      resolve();
    });
  });

  let testUserToken = null;
  let testUserId = null;
  let sentSnapId = null;
  let memoryId = null;

  try {
    // 1. Server & Security
    await runTest('Security & Server', 'GET /health returns 200 with security headers', async () => {
      const res = await request('GET', '/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.ok, true);
      assert(res.headers['content-security-policy']);
      assert.strictEqual(res.headers['x-frame-options'], 'DENY');
    });

    await runTest('Security & Server', 'Blocks directory traversal attempts', async () => {
      const res = await request('GET', '/../../etc/passwd');
      assert.strictEqual(res.status, 403);
    });

    // 2. Authentication
    await runTest('Auth Engine', 'Registers new snapper account with initial score', async () => {
      const username = 'snapper_' + Date.now();
      const res = await request('POST', '/api/auth/register', {
        username,
        email: `${username}@snap.local`,
        password: 'ValidPassword123!',
        displayName: 'Test Snapper'
      });
      assert.strictEqual(res.status, 201);
      assert(res.json.token);
      assert.strictEqual(res.json.user.snapScore, 10);
      testUserToken = res.json.token;
      testUserId = res.json.user.id;
    });

    await runTest('Auth Engine', 'Logs in with seeded user credentials', async () => {
      const res = await request('POST', '/api/auth/login', {
        username: 'kai_runner',
        password: 'InsayPassword123!'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.user.username, 'kai_runner');
    });

    // 3. Ephemeral Snaps & Server Purge
    await runTest('Ephemeral Snaps', 'Sends direct snap with duration cap', async () => {
      const res = await request('POST', '/api/snaps', {
        recipientId: 'usr_kai',
        mediaPath: 'data:image/svg+xml;utf8,<svg width="100" height="100"><circle cx="50" cy="50" r="50" fill="yellow"/></svg>',
        mediaType: 'image',
        caption: 'Quick sunset capture!',
        durationSeconds: 5
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(res.status, 201);
      assert(res.json.snapId);
      sentSnapId = res.json.snapId;
    });

    await runTest('Ephemeral Snaps', 'Recipient opens snap and receives duration timer', async () => {
      const kaiLogin = await request('POST', '/api/auth/login', {
        username: 'kai_runner',
        password: 'InsayPassword123!'
      });
      const kaiToken = kaiLogin.json.token;

      const resOpen = await request('POST', `/api/snaps/${sentSnapId}/open`, null, {
        Authorization: `Bearer ${kaiToken}`
      });

      assert.strictEqual(resOpen.status, 200);
      assert.strictEqual(resOpen.json.durationSeconds, 5);
      assert(resOpen.json.expiresAt > Date.now());
    });

    await runTest('Server-Side Deletion Policy', 'Physically deletes expired snap from database upon consumption', async () => {
      const kaiLogin = await request('POST', '/api/auth/login', {
        username: 'kai_runner',
        password: 'InsayPassword123!'
      });
      const kaiToken = kaiLogin.json.token;

      // Consume snap
      const resConsume = await request('POST', `/api/snaps/${sentSnapId}/consumed`, null, {
        Authorization: `Bearer ${kaiToken}`
      });
      assert.strictEqual(resConsume.status, 200);

      // Verify physical deletion from DB
      const row = db.get('SELECT * FROM snaps WHERE id = ?', sentSnapId);
      assert(!row, 'Snap was merely hidden, not physically deleted from database');
    });

    // 4. 24h Stories
    await runTest('Stories Engine', 'Publishes 24-hour story with expiration', async () => {
      const resStory = await request('POST', '/api/stories', {
        mediaPath: 'data:image/svg+xml;utf8,<svg width="100" height="100"><rect width="100" height="100" fill="purple"/></svg>',
        mediaType: 'image',
        caption: 'Daily workout grind'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resStory.status, 201);
      assert(resStory.json.storyId);
      assert(resStory.json.expiresAt > Date.now());
    });

    // 5. Permanent Memories Vault
    await runTest('Memories Vault', 'Saves snap to permanent private vault and verifies persistence', async () => {
      const resMem = await request('POST', '/api/memories', {
        mediaPath: 'data:image/svg+xml;utf8,<svg width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>',
        mediaType: 'image',
        caption: 'Unforgettable mountain summit'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resMem.status, 201);
      assert(resMem.json.memoryId);
      memoryId = resMem.json.memoryId;

      const resList = await request('GET', '/api/memories', null, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(resList.status, 200);
      const found = resList.json.memories.find(m => m.id === memoryId);
      assert(found, 'Saved memory not found in vault');
    });

    // 6. Streaks & Friends Graph
    await runTest('Streaks & Friends', 'Adds friend and verifies streak counter initialization', async () => {
      const resFriend = await request('POST', '/api/friends/request/usr_chloe', null, {
        Authorization: `Bearer ${testUserToken}`
      });
      assert.strictEqual(resFriend.status, 201);

      const resList = await request('GET', '/api/friends', null, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(resList.status, 200);
      const found = resList.json.friends.find(f => f.id === 'usr_chloe');
      assert(found, 'Friend not present in list');
      assert.strictEqual(found.streak_count, 1);
    });

    // 7. Trust & Safety
    await runTest('Trust & Safety', 'Files moderation report for disappearing content', async () => {
      const resReport = await request('POST', '/api/reports', {
        targetType: 'snap',
        targetId: 'snap_sample_1',
        reason: 'Harassment'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resReport.status, 201);
    });

  } finally {
    server.close();
  }

  console.log('\n======================================================');
  console.log(` SUMMARY: ${passedCount} passed, ${failedCount} failed (${passedCount + failedCount} total)`);
  console.log('======================================================');

  if (failedCount > 0) process.exit(1);
}

runAll();
