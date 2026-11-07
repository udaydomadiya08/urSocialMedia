#!/usr/bin/env node
'use strict';

/**
 * Insaybook — Automated Verification & Integration Test Suite
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
  console.log(' INSAYBOOK Comprehensive Verification Suite');
  console.log('======================================================\n');

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      testPort = server.address().port;
      resolve();
    });
  });

  let testUserToken = null;
  let testUserId = null;
  let createdPostId = null;
  let createdGroupId = null;
  let createdEventId = null;

  try {
    // 1. Server & Security
    await runTest('Security & Server', 'GET /health returns 200 with CSP and security headers', async () => {
      const res = await request('GET', '/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.ok, true);
      assert(res.headers['content-security-policy']);
      assert.strictEqual(res.headers['x-frame-options'], 'DENY');
    });

    await runTest('Security & Server', 'Blocks directory traversal attempts with HTTP 403', async () => {
      const res = await request('GET', '/../../etc/passwd');
      assert.strictEqual(res.status, 403);
    });

    // 2. Authentication
    await runTest('Auth Engine', 'Registers new community account and returns session token', async () => {
      const username = 'neighbour_' + Date.now();
      const res = await request('POST', '/api/auth/register', {
        username,
        email: `${username}@community.org`,
        password: 'ValidPassword123!',
        displayName: 'Friendly Neighbor'
      });
      assert.strictEqual(res.status, 201);
      assert(res.json.token);
      testUserToken = res.json.token;
      testUserId = res.json.user.id;
    });

    await runTest('Auth Engine', 'Logs in with seeded user credentials', async () => {
      const res = await request('POST', '/api/auth/login', {
        username: 'ashapatel',
        password: 'InsayPassword123!'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.user.username, 'ashapatel');
    });

    // 3. News Feed & Multi-Reaction Engine
    await runTest('News Feed', 'Publishes post with audience controls', async () => {
      const res = await request('POST', '/api/posts', {
        content: 'Excited for the neighborhood community cleanup this weekend!',
        audience: 'public'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(res.status, 201);
      assert(res.json.postId);
      createdPostId = res.json.postId;
    });

    await runTest('Reaction Engine', 'Toggles emotional reactions (love, haha, wow)', async () => {
      // React with 'love'
      const resLove = await request('POST', `/api/posts/${createdPostId}/react`, {
        reaction: 'love'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resLove.status, 200);
      assert.strictEqual(resLove.json.myReaction, 'love');
      assert.strictEqual(resLove.json.reactionCounts.love, 1);

      // Change reaction to 'haha'
      const resHaha = await request('POST', `/api/posts/${createdPostId}/react`, {
        reaction: 'haha'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resHaha.status, 200);
      assert.strictEqual(resHaha.json.myReaction, 'haha');
      assert.strictEqual(resHaha.json.reactionCounts.haha, 1);
      assert(!resHaha.json.reactionCounts.love || resHaha.json.reactionCounts.love === 0);
    });

    await runTest('Discussion', 'Adds comment to post and retrieves comments thread', async () => {
      const resAdd = await request('POST', `/api/posts/${createdPostId}/comments`, {
        text: 'I will bring extra gloves and trash bags!'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resAdd.status, 201);

      const resList = await request('GET', `/api/posts/${createdPostId}/comments`);
      assert.strictEqual(resList.status, 200);
      assert(resList.json.comments.length >= 1);
    });

    // 4. Friends & Relationships
    await runTest('Friends Graph', 'Sends friend request and manages status', async () => {
      const resReq = await request('POST', '/api/friends/request/usr_elena', null, {
        Authorization: `Bearer ${testUserToken}`
      });
      assert.strictEqual(resReq.status, 201);

      // Verify incoming request on Elena's side
      const elenaLogin = await request('POST', '/api/auth/login', {
        username: 'elenarostova',
        password: 'InsayPassword123!'
      });
      const elenaToken = elenaLogin.json.token;

      const resFriends = await request('GET', '/api/friends', null, {
        Authorization: `Bearer ${elenaToken}`
      });
      assert.strictEqual(resFriends.status, 200);
      const found = resFriends.json.incomingRequests.find(r => r.id === testUserId);
      assert(found, 'Friend request not visible to recipient');

      // Elena accepts request
      const resAccept = await request('POST', `/api/friends/respond/${testUserId}`, {
        action: 'accept'
      }, { Authorization: `Bearer ${elenaToken}` });
      assert.strictEqual(resAccept.status, 200);
      assert.strictEqual(resAccept.json.status, 'accepted');
    });

    // 5. Community Groups
    await runTest('Groups Hub', 'Creates community group and manages member join/leave', async () => {
      const resCreate = await request('POST', '/api/groups', {
        name: 'Clean Energy & Solar Co-op',
        description: 'Community bulk solar purchasing and renewable energy projects.',
        privacy: 'public'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resCreate.status, 201);
      createdGroupId = resCreate.json.groupId;

      // Join group with another user
      const marcusLogin = await request('POST', '/api/auth/login', { username: 'marcusthompson', password: 'InsayPassword123!' });
      const marcusToken = marcusLogin.json.token;

      const resJoin = await request('POST', `/api/groups/${createdGroupId}/join`, null, { Authorization: `Bearer ${marcusToken}` });
      assert.strictEqual(resJoin.status, 200);
      assert.strictEqual(resJoin.json.joined, true);
    });

    // 6. Community Events
    await runTest('Events Hub', 'Schedules community event and tracks RSVPs', async () => {
      const resEvent = await request('POST', '/api/events', {
        title: 'Solar Panel Workshop & Q&A',
        description: 'Learn how to install net-metered rooftop solar.',
        location: 'Civic Auditorium Room B',
        eventDate: new Date(Date.now() + 86400000 * 4).toISOString()
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resEvent.status, 201);
      createdEventId = resEvent.json.eventId;

      const resRSVP = await request('POST', `/api/events/${createdEventId}/rsvp`, {
        status: 'going'
      }, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(resRSVP.status, 200);
      assert.strictEqual(resRSVP.json.status, 'going');
    });

    // 7. Marketplace
    await runTest('Marketplace', 'Lists item for sale and queries marketplace index', async () => {
      const resList = await request('POST', '/api/marketplace', {
        title: 'Bicycle Commuter Pannier Bags',
        description: 'Waterproof pair of 25L panniers in like-new condition.',
        price: 55.0,
        category: 'Sports',
        location: 'Downtown'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resList.status, 201);
      assert(resList.json.itemId);

      const resQuery = await request('GET', '/api/marketplace?search=Pannier');
      assert.strictEqual(resQuery.status, 200);
      assert(resQuery.json.items.length >= 1);
    });

    // 8. Messenger
    await runTest('Messenger', 'Delivers direct message between users', async () => {
      const resMsg = await request('POST', '/api/messenger/usr_asha', {
        text: 'Hi Asha, I saw your community garden update!'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resMsg.status, 201);
      assert(resMsg.json.messageId);

      const resHistory = await request('GET', '/api/messenger/usr_asha', null, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(resHistory.status, 200);
      assert(resHistory.json.messages.length >= 1);
    });

    // 9. Content Moderation
    await runTest('Trust & Safety', 'Submits report on inappropriate content', async () => {
      const resReport = await request('POST', '/api/reports', {
        targetType: 'post',
        targetId: createdPostId,
        reason: 'Misinformation or offensive content'
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

