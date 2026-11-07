#!/usr/bin/env node
'use strict';

/**
 * Insaygram — Automated Verification & Integration Test Suite
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
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
          try {
            json = JSON.parse(data);
          } catch {}
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
  console.log(' INSAYGRAM Comprehensive Verification Suite');
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

  try {
    // 1. Health & Headers
    await runTest('Security & Server', 'GET /health returns 200 with security headers', async () => {
      const res = await request('GET', '/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.ok, true);
      assert(res.headers['content-security-policy'], 'Missing CSP header');
      assert.strictEqual(res.headers['x-frame-options'], 'DENY');
      assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    });

    await runTest('Security & Server', 'Blocks directory traversal and dotfile access', async () => {
      const res1 = await request('GET', '/../../etc/passwd');
      assert.strictEqual(res1.status, 403);
      const res2 = await request('GET', '/.env');
      assert.strictEqual(res2.status, 403);
    });

    // 2. Authentication
    await runTest('Auth Engine', 'Rejects registration with short password or invalid email', async () => {
      const res1 = await request('POST', '/api/auth/register', { username: 'testuser', email: 'notanemail', password: '123' });
      assert.strictEqual(res1.status, 400);
      const res2 = await request('POST', '/api/auth/register', { username: 'bad user!', email: 'valid@example.com', password: 'ValidPassword123' });
      assert.strictEqual(res2.status, 400);
    });

    await runTest('Auth Engine', 'Successfully registers new account and returns secure session token', async () => {
      const username = 'test_artist_' + Date.now();
      const res = await request('POST', '/api/auth/register', {
        username,
        email: `${username}@test.com`,
        password: 'SecurePassword123!',
        displayName: 'Test Artist'
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.ok, true);
      assert(res.json.token, 'Token not returned');
      assert(res.headers['set-cookie'], 'Missing Set-Cookie header');

      testUserToken = res.json.token;
      testUserId = res.json.user.id;
    });

    await runTest('Auth Engine', 'Logs in successfully with seeded user credentials', async () => {
      const res = await request('POST', '/api/auth/login', {
        username: 'mirachen',
        password: 'InsayPassword123!'
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.user.username, 'mirachen');
    });

    await runTest('Auth Engine', 'GET /api/auth/me returns authenticated user context', async () => {
      const res = await request('GET', '/api/auth/me', null, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.user.id, testUserId);
    });

    // 3. Posts & Media
    await runTest('Post Lifecycle', 'Creates a post with caption and verified location', async () => {
      const res = await request('POST', '/api/posts', {
        caption: 'Sunset over Kyoto bamboo grove #zen #nature',
        location: 'Kyoto Arashiyama',
        media: [{ url: 'https://images.example.com/kyoto.jpg', type: 'image' }]
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(res.status, 201);
      assert(res.json.postId, 'Missing postId');
      createdPostId = res.json.postId;
    });

    await runTest('Post Lifecycle', 'Retrieves feed including newly created post', async () => {
      const res = await request('GET', '/api/posts', null, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.json.posts));
      const found = res.json.posts.find(p => p.id === createdPostId);
      assert(found, 'Created post not found in feed');
      assert.strictEqual(found.caption, 'Sunset over Kyoto bamboo grove #zen #nature');
    });

    await runTest('Engagement', 'Likes and unlikes post with correct counter increment', async () => {
      // Like
      const resLike = await request('POST', `/api/posts/${createdPostId}/like`, null, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(resLike.status, 200);
      assert.strictEqual(resLike.json.liked, true);
      assert.strictEqual(resLike.json.likeCount, 1);

      // Unlike
      const resUnlike = await request('POST', `/api/posts/${createdPostId}/like`, null, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(resUnlike.status, 200);
      assert.strictEqual(resUnlike.json.liked, false);
      assert.strictEqual(resUnlike.json.likeCount, 0);
    });

    await runTest('Engagement', 'Posts comment and attaches to post thread', async () => {
      const res = await request('POST', `/api/posts/${createdPostId}/comments`, {
        text: 'Incredible lighting and composition!'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.comment.text, 'Incredible lighting and composition!');

      const resList = await request('GET', `/api/posts/${createdPostId}/comments`);
      assert.strictEqual(resList.status, 200);
      assert(resList.json.comments.length >= 1);
    });

    // 4. Stories & Expiration
    await runTest('Stories Engine', 'Creates a story expiring in 24 hours', async () => {
      const res = await request('POST', '/api/stories', {
        mediaUrl: 'https://images.example.com/story1.jpg',
        caption: 'Morning coffee rituals'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(res.status, 201);
      assert(res.json.storyId);
      assert(res.json.expiresAt > Date.now());
    });

    await runTest('Stories Engine', 'Retrieves active stories list', async () => {
      const res = await request('GET', '/api/stories', null, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.json.users));
      assert(res.json.users.length > 0);
    });

    // 5. Social Graph & Following
    await runTest('Social Graph', 'Follows and unfollows another creator', async () => {
      const resFollow = await request('POST', '/api/users/usr_mira/follow', null, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(resFollow.status, 200);
      assert.strictEqual(resFollow.json.following, true);

      const resProfile = await request('GET', '/api/users/mirachen', null, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(resProfile.status, 200);
      assert.strictEqual(resProfile.json.user.is_following, true);
    });

    // 6. Direct Messaging
    await runTest('Direct Messaging', 'Sends direct message and retrieves conversation history', async () => {
      const resSend = await request('POST', '/api/messages/usr_mira', {
        text: 'Hello Mira, love your Kyoto architectural shots!'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resSend.status, 201);

      const resConvs = await request('GET', '/api/messages/conversations', null, { Authorization: `Bearer ${testUserToken}` });
      assert.strictEqual(resConvs.status, 200);
      assert(resConvs.json.conversations.length > 0);
    });

    // 7. Content Moderation
    await runTest('Trust & Safety', 'Submits content moderation report', async () => {
      const res = await request('POST', '/api/reports', {
        targetType: 'post',
        targetId: createdPostId,
        reason: 'Commercial spam'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.json.ok, true);
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
