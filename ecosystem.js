'use strict';

/**
 * INSAY Social Platforms Suite — Ecosystem Orchestrator
 * Spawns and supervises all 5 independent social platforms concurrently.
 */

const { fork } = require('child_process');
const path = require('path');

const PLATFORMS = [
  {
    name: 'INSAYGRAM',
    port: 4173,
    color: '\x1b[35m', // Magenta
    dir: path.join(__dirname, 'apps', 'insaygram'),
    entry: path.join(__dirname, 'apps', 'insaygram', 'server.js'),
    desc: 'Visual Social Networking (Reels, Stories, Explore, DMs)'
  },
  {
    name: 'INSAYBOOK',
    port: 4174,
    color: '\x1b[34m', // Blue
    dir: path.join(__dirname, 'apps', 'insaybook'),
    entry: path.join(__dirname, 'apps', 'insaybook', 'server.js'),
    desc: 'Communities, Groups, Events, Marketplace & Messenger'
  },
  {
    name: 'INSAYSNAP',
    port: 4175,
    color: '\x1b[33m', // Yellow
    dir: path.join(__dirname, 'apps', 'insaysnap'),
    entry: path.join(__dirname, 'apps', 'insaysnap', 'server.js'),
    desc: 'Camera-First Ephemeral Media & Server-Side Auto-Destruct'
  },
  {
    name: 'INSAYTOK',
    port: 4176,
    color: '\x1b[36m', // Cyan
    dir: path.join(__dirname, 'apps', 'insaytok'),
    entry: path.join(__dirname, 'apps', 'insaytok', 'server.js'),
    desc: 'Short-Form Video & Explainable Recommendation Engine'
  },
  {
    name: 'INSAYCORD',
    port: 4177,
    color: '\x1b[32m', // Green
    dir: path.join(__dirname, 'apps', 'insaycord'),
    entry: path.join(__dirname, 'apps', 'insaycord', 'server.js'),
    desc: 'Real-Time Communities, Text Channels & WebRTC Voice Rooms'
  },
  {
    name: 'INSAYTUBE',
    port: 4178,
    color: '\x1b[31m', // Red
    dir: path.join(__dirname, 'apps', 'insaytube'),
    entry: path.join(__dirname, 'apps', 'insaytube', 'server.js'),
    desc: 'Long-Form Video, Multi-Algorithm Equalizer & Topic Presets'
  }
];

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

console.log(`${BOLD}========================================================================${RESET}`);
console.log(`${BOLD}           INSAY SOCIAL NETWORK ECOSYSTEM ORCHESTRATOR                  ${RESET}`);
console.log(`${BOLD}========================================================================${RESET}`);
console.log(`Starting 6 independent production platforms concurrently...\n`);

const processes = [];

PLATFORMS.forEach(platform => {
  console.log(`  ${platform.color}● ${platform.name.padEnd(10)}${RESET} -> http://127.0.0.1:${platform.port} (${platform.desc})`);

  const child = fork(platform.entry, [], {
    cwd: platform.dir,
    env: { ...process.env, PORT: platform.port, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  child.stdout.on('data', data => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        console.log(`${platform.color}[${platform.name}]${RESET} ${line}`);
      }
    });
  });

  child.stderr.on('data', data => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        console.error(`${platform.color}[${platform.name} ERR]${RESET} ${line}`);
      }
    });
  });

  child.on('exit', (code, signal) => {
    console.log(`${platform.color}[${platform.name}]${RESET} Process exited with code ${code} (signal: ${signal})`);
  });

  processes.push(child);
});

console.log(`\n${BOLD}All platforms initialized and listening on ports 4173-4178.${RESET}`);
console.log(`Press Ctrl+C to terminate all platform processes.\n`);

function shutdown() {
  console.log(`\n${BOLD}Gracefully shutting down all INSAY ecosystem services...${RESET}`);
  processes.forEach(child => {
    try {
      child.kill('SIGTERM');
    } catch (_) {}
  });
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

