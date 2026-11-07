'use strict';

/**
 * Insaycord — Automated Integration & Quality Assurance Test Suite
 */

const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { server, db } = require('../server.js');

const PORT = 4187; // Dedicated test port
let baseUrl = `http://127.0.0.1:${PORT}`;

function makeRequest(method, endpoint, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      hostname: '127.0.0.1',
      port: PORT,
      path: endpoint,
      headers: {
        'Accept': 'application/json',
        ...headers
      }
    };

    let bodyData = null;
    if (body) {
      bodyData = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
          rawText: data
        });
      });
    });

    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

let authCookie = '';
let createdServerId = '';
let createdChannelId = '';
let createdMessageId = '';

// Test 1: Health Check
test('Health check endpoint returns ok: true with platform metadata', async () => {
  const res = await makeRequest('GET', '/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(res.data.platform, 'insaycord');
});

// Test 2: Demo User Login
test('Demo user login with alex_architect succeeds and sets auth cookie', async () => {
  const res = await makeRequest('POST', '/api/auth/login', {
    username: 'alex_architect',
    password: 'insaypass123'
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(res.data.user.username, 'alex_architect');

  const cookie = res.headers['set-cookie'];
  assert(cookie, 'Set-Cookie header must be present');
  authCookie = cookie[0].split(';')[0];
});

// Test 3: Authenticated User Info
test('GET /api/auth/me returns current user identity with session cookie', async () => {
  const res = await makeRequest('GET', '/api/auth/me', null, { Cookie: authCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(res.data.user.username, 'alex_architect');
});

// Test 4: New User Registration
test('POST /api/auth/register registers new user and auto-joins default server', async () => {
  const uniqueName = 'cord_user_' + Date.now().toString().slice(-5);
  const res = await makeRequest('POST', '/api/auth/register', {
    username: uniqueName,
    email: `${uniqueName}@example.com`,
    password: 'securepassword123',
    displayName: 'Discordant One'
  });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(res.data.user.username, uniqueName);
});

// Test 5: List Current User Servers
test('GET /api/servers returns user joined servers including The Workshop', async () => {
  const res = await makeRequest('GET', '/api/servers', null, { Cookie: authCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.ok, true);
  assert(Array.isArray(res.data.servers));
  assert(res.data.servers.some(s => s.id === 'srv_workshop'));
});

// Test 6: Create Server
test('POST /api/servers creates community server with default general & voice channels', async () => {
  const res = await makeRequest('POST', '/api/servers', {
    name: 'DevOps and Architecture',
    description: 'Cloud systems and microservices discussion'
  }, { Cookie: authCookie });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.data.ok, true);
  assert(res.data.serverId);
  createdServerId = res.data.serverId;
});

// Test 7: Get Server Details, Channels, and Members
test('GET /api/servers/:id returns server channels, member roster, and user role', async () => {
  const res = await makeRequest('GET', `/api/servers/${createdServerId}`, null, { Cookie: authCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(res.data.server.name, 'DevOps and Architecture');
  assert.strictEqual(res.data.myRole, 'owner');
  assert(res.data.channels.length >= 2, 'Should create default text and voice channels');
  assert(res.data.members.length >= 1, 'Owner should be member');
});

// Test 8: Create Channel
test('POST /api/servers/:id/channels creates new text channel', async () => {
  const res = await makeRequest('POST', `/api/servers/${createdServerId}/channels`, {
    name: 'kubernetes',
    type: 'text',
    topic: 'Cluster management discussion'
  }, { Cookie: authCookie });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.data.ok, true);
  assert(res.data.channelId);
  createdChannelId = res.data.channelId;
});

// Test 9: Post Channel Message
test('POST /api/channels/:id/messages posts real-time message', async () => {
  const res = await makeRequest('POST', `/api/channels/${createdChannelId}/messages`, {
    content: 'Zero-downtime rolling deploys configured.'
  }, { Cookie: authCookie });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(res.data.message.content, 'Zero-downtime rolling deploys configured.');
  createdMessageId = res.data.message.id;
});

// Test 10: Fetch Channel Messages
test('GET /api/channels/:id/messages returns message stream', async () => {
  const res = await makeRequest('GET', `/api/channels/${createdChannelId}/messages`, null, { Cookie: authCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.ok, true);
  assert(res.data.messages.some(m => m.id === createdMessageId));
});

// Test 11: Edit Message
test('PATCH /api/messages/:id allows message author to update message', async () => {
  const res = await makeRequest('PATCH', `/api/messages/${createdMessageId}`, {
    content: 'Zero-downtime canary deploys configured.'
  }, { Cookie: authCookie });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(res.data.content, 'Zero-downtime canary deploys configured.');
});

// Test 12: Add Reaction to Message
test('POST /api/messages/:id/react adds and toggles reaction emoji', async () => {
  const res = await makeRequest('POST', `/api/messages/${createdMessageId}/react`, {
    emoji: '🚀'
  }, { Cookie: authCookie });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.ok, true);
  assert(res.data.reactions.some(r => r.emoji === '🚀' && r.count === 1));
});

// Test 13: Voice Room Participant State
test('GET /api/voice/rooms/:channelId queries voice room participant state', async () => {
  const res = await makeRequest('GET', `/api/voice/rooms/chn_lounge`, null, { Cookie: authCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.ok, true);
  assert(Array.isArray(res.data.participants));
});

// Test 14: Submit Report
test('POST /api/reports records moderation report for message', async () => {
  const res = await makeRequest('POST', '/api/reports', {
    targetType: 'message',
    targetId: createdMessageId,
    reason: 'Policy check',
    details: 'Automated test verification.'
  }, { Cookie: authCookie });

  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.data.ok, true);
  assert(res.data.repId);
});

// Test 15: Delete Message
test('DELETE /api/messages/:id deletes message', async () => {
  const res = await makeRequest('DELETE', `/api/messages/${createdMessageId}`, null, { Cookie: authCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.ok, true);
  assert.strictEqual(res.data.deleted, true);
});

// Test 16: Security Traversal Blocked
test('Security guard rejects directory traversal with HTTP 403', async () => {
  const res = await makeRequest('GET', '/../etc/passwd');
  assert.strictEqual(res.status, 403);
});

async function run() {
  console.log(`\n==================================================`);
  console.log(`   RUNNING INSAYCORD QA VERIFICATION SUITE       `);
  console.log(`==================================================\n`);

  server.listen(PORT, '127.0.0.1');
  await new Promise(r => setTimeout(r, 200));

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✔ [PASS] ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`  ✖ [FAIL] ${t.name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n--------------------------------------------------`);
  console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`--------------------------------------------------\n`);

  server.close(() => {
    process.exit(failed === 0 ? 0 : 1);
  });
}

run();
