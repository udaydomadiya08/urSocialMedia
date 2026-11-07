#!/usr/bin/env node
'use strict';

/**
 * Insaytok — Automated Verification & Recommendation Model Suite
 */

const assert = require('assert');
const http = require('http');
const { performance } = require('perf_hooks');

const { server, db } = require('../server.js');
const { computeTagAffinity, computeVelocity, computeRecency, rankFeed } = require('../src/server/recommendation.js');

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
  console.log(' INSAYTOK Recommendation & Video Verification Suite');
  console.log('======================================================\n');

  // Unit Tests: Recommendation Model
  await runTest('Recommendation Algorithm', 'Computes deterministic tag affinity with positive monotonic response', async () => {
    const userWeights = new Map([['science', 3.0], ['nature', 1.5]]);
    const scoreA = computeTagAffinity(['science', 'nature'], userWeights);
    const scoreB = computeTagAffinity(['cooking', 'recipes'], userWeights);
    assert(scoreA > scoreB, 'Tag affinity failed to prioritize matching interests');
    assert.strictEqual(scoreB, 0);
  });

  await runTest('Recommendation Algorithm', 'Velocity computation scales with engagement ratio', async () => {
    const highVel = computeVelocity(500, 1000); // 50% like ratio
    const lowVel = computeVelocity(10, 1000);   // 1% like ratio
    assert(highVel > lowVel);
  });

  await runTest('Recommendation Algorithm', 'Recency decay prioritizes fresher videos over aged ones', async () => {
    const fresh = computeRecency(Date.now() - 3600000); // 1h ago
    const aged = computeRecency(Date.now() - 30 * 86400000); // 30 days ago
    assert(fresh > aged);
  });

  await runTest('Recommendation Algorithm', 'Applies creator diversity penalty to prevent creator fatigue', async () => {
    const candidates = [
      { id: 'v1', user_id: 'creator_a', tags: 'tech', like_count: 50, view_count: 200, created_at: Date.now() },
      { id: 'v2', user_id: 'creator_b', tags: 'tech', like_count: 50, view_count: 200, created_at: Date.now() }
    ];
    // User recently watched creator_a
    const history = [{ user_id: 'creator_a', tags: 'tech', completion_rate: 1.0 }];
    const ranked = rankFeed(candidates, history, []);

    // creator_b should rank higher due to diversity penalty on creator_a
    assert.strictEqual(ranked[0].user_id, 'creator_b');
    assert(ranked.find(v => v.user_id === 'creator_a').recommendation_meta.breakdown.diversityPenalty > 0);
  });

  // Integration Tests
  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      testPort = server.address().port;
      resolve();
    });
  });

  let testUserToken = null;
  let testUserId = null;
  let publishedVideoId = null;

  try {
    await runTest('Security & Server', 'GET /health returns 200 with security headers', async () => {
      const res = await request('GET', '/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.ok, true);
      assert(res.headers['content-security-policy']);
    });

    await runTest('Auth Engine', 'Registers new creator account and returns session token', async () => {
      const username = 'creator_' + Date.now();
      const res = await request('POST', '/api/auth/register', {
        username,
        email: `${username}@tok.local`,
        password: 'ValidPassword123!',
        displayName: 'Test Creator'
      });
      assert.strictEqual(res.status, 201);
      assert(res.json.token);
      testUserToken = res.json.token;
      testUserId = res.json.user.id;
    });

    await runTest('Video Publishing', 'Publishes video with extracted hashtags and custom audio title', async () => {
      const res = await request('POST', '/api/videos', {
        videoUrl: 'https://cdn.example.com/videos/sample.mp4',
        caption: 'Building a custom split ergonomic keyboard from scratch! #diy #tech #keyboards',
        soundTitle: 'Mechanical Switches ASMR'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(res.status, 201);
      assert(res.json.videoId);
      publishedVideoId = res.json.videoId;
    });

    await runTest('Feed & Explainable Ranking', 'Feed delivers explainable recommendation metadata for each candidate', async () => {
      const res = await request('GET', '/api/feed?type=foryou', null, {
        Authorization: `Bearer ${testUserToken}`
      });

      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.json.videos));
      assert(res.json.videos.length > 0);

      const first = res.json.videos[0];
      assert(first.recommendation_meta, 'Missing recommendation metadata');
      assert(first.recommendation_meta.breakdown, 'Missing mathematical breakdown');
      assert(first.recommendation_meta.reasons.length > 0, 'Missing explanation badge reasons');
    });

    await runTest('Engagement', 'Likes video with atomic counter update and bookmark save', async () => {
      const resLike = await request('POST', `/api/videos/${publishedVideoId}/like`, null, {
        Authorization: `Bearer ${testUserToken}`
      });
      assert.strictEqual(resLike.status, 200);
      assert.strictEqual(resLike.json.liked, true);
      assert.strictEqual(resLike.json.likeCount, 1);

      const resSave = await request('POST', `/api/videos/${publishedVideoId}/save`, null, {
        Authorization: `Bearer ${testUserToken}`
      });
      assert.strictEqual(resSave.status, 200);
      assert.strictEqual(resSave.json.saved, true);
    });

    await runTest('Discussion', 'Posts comment on video and retrieves discussion thread', async () => {
      const resComment = await request('POST', `/api/videos/${publishedVideoId}/comments`, {
        text: 'What switches did you use for the spacebar?'
      }, { Authorization: `Bearer ${testUserToken}` });

      assert.strictEqual(resComment.status, 201);

      const resList = await request('GET', `/api/videos/${publishedVideoId}/comments`);
      assert.strictEqual(resList.status, 200);
      assert(resList.json.comments.length >= 1);
    });

    await runTest('Social Graph', 'Follows creator with atomic counter increments', async () => {
      const resFollow = await request('POST', '/api/users/usr_lee/follow', null, {
        Authorization: `Bearer ${testUserToken}`
      });
      assert.strictEqual(resFollow.status, 200);
      assert.strictEqual(resFollow.json.following, true);
    });

    await runTest('Trust & Safety', 'Submits report on video content', async () => {
      const resReport = await request('POST', '/api/reports', {
        targetType: 'video',
        targetId: publishedVideoId,
        reason: 'Copyright Infringement'
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

