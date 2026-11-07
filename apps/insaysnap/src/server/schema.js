'use strict';

/**
 * Insaysnap — Database Schema & Initial Seeder
 */

const { hashPassword } = require('./core/auth.js');

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_insaysnap_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT DEFAULT '',
        snap_score INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_agent TEXT,
        ip TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS friend_requests (
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted'
        created_at INTEGER NOT NULL,
        PRIMARY KEY (sender_id, receiver_id),
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS friends (
        user_a TEXT NOT NULL,
        user_b TEXT NOT NULL,
        streak_count INTEGER DEFAULT 0,
        last_snap_at INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_a, user_b),
        FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS snaps (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        media_path TEXT NOT NULL,
        media_type TEXT NOT NULL, -- 'image', 'video'
        caption TEXT DEFAULT '',
        duration_seconds INTEGER DEFAULT 5, -- 1 to 10 seconds
        is_opened INTEGER DEFAULT 0,
        opened_at INTEGER,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS snap_stories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        media_path TEXT NOT NULL,
        media_type TEXT NOT NULL,
        caption TEXT DEFAULT '',
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS story_views (
        story_id TEXT NOT NULL,
        viewer_id TEXT NOT NULL,
        viewed_at INTEGER NOT NULL,
        PRIMARY KEY (story_id, viewer_id),
        FOREIGN KEY (story_id) REFERENCES snap_stories(id) ON DELETE CASCADE,
        FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        media_path TEXT NOT NULL,
        media_type TEXT NOT NULL,
        caption TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        text TEXT NOT NULL,
        is_opened INTEGER DEFAULT 0,
        opened_at INTEGER,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        details TEXT DEFAULT '',
        status TEXT DEFAULT 'open',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS blocks (
        blocker_id TEXT NOT NULL,
        blocked_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (blocker_id, blocked_id),
        FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `
  }
];

function seedDatabase(db) {
  const userCount = db.get('SELECT COUNT(*) as count FROM users').count;
  if (userCount > 0) return;

  const now = Date.now();
  const defaultPw = hashPassword('InsayPassword123!');

  const users = [
    {
      id: 'usr_kai',
      username: 'kai_runner',
      email: 'kai@example.com',
      displayName: 'Kai Vance',
      snapScore: 4320,
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%23fffc00"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="%23111" text-anchor="middle">KV</text></svg>'
    },
    {
      id: 'usr_chloe',
      username: 'chloe_vibes',
      email: 'chloe@example.com',
      displayName: 'Chloe Lin',
      snapScore: 8910,
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%23f97316"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">CL</text></svg>'
    },
    {
      id: 'usr_demo',
      username: 'demo_user',
      email: 'demo@insaysnap.local',
      displayName: 'Demo Snapper',
      snapScore: 1250,
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%2310b981"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">DE</text></svg>'
    }
  ];

  for (const u of users) {
    db.run(
      `INSERT INTO users (id, username, email, password_hash, salt, display_name, avatar_url, snap_score, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      u.id, u.username, u.email, defaultPw.hash, defaultPw.salt, u.displayName, u.avatarUrl, u.snapScore, 0, now - 10 * 86400000
    );
  }

  // Friends & Streaks
  db.run('INSERT INTO friends VALUES (?, ?, ?, ?, ?)', 'usr_demo', 'usr_kai', 14, now - 3600000 * 2, now - 14 * 86400000);
  db.run('INSERT INTO friends VALUES (?, ?, ?, ?, ?)', 'usr_demo', 'usr_chloe', 7, now - 3600000 * 8, now - 7 * 86400000);

  // Sample stories (24h expiry)
  db.run(
    'INSERT INTO snap_stories VALUES (?, ?, ?, ?, ?, ?, ?)',
    'sn_st_1',
    'usr_kai',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700"><rect width="400" height="700" fill="%23e11d48"/><text x="200" y="350" font-size="28" fill="white" text-anchor="middle">Behind the scenes at sunrise</text></svg>',
    'image',
    'Morning training route done 🔥',
    now + 20 * 3600000,
    now - 4 * 3600000
  );

  db.run(
    'INSERT INTO snap_stories VALUES (?, ?, ?, ?, ?, ?, ?)',
    'sn_st_2',
    'usr_chloe',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700"><rect width="400" height="700" fill="%237c3aed"/><text x="200" y="350" font-size="28" fill="white" text-anchor="middle">Sunset beach beats</text></svg>',
    'image',
    'Vibes only ✨',
    now + 16 * 3600000,
    now - 8 * 3600000
  );

  // Sample incoming unopened snap for Demo User
  db.run(
    'INSERT INTO snaps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    'snap_sample_1',
    'usr_kai',
    'usr_demo',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700"><rect width="400" height="700" fill="%230284c7"/><text x="200" y="350" font-size="26" fill="white" text-anchor="middle">Check out this trail view!</text></svg>',
    'image',
    'Hit the ridge in record time!',
    6, // 6 seconds duration
    0, // not opened
    null,
    null,
    now - 3600000
  );

  // Sample Memory for Demo user
  db.run(
    'INSERT INTO memories VALUES (?, ?, ?, ?, ?, ?)',
    'mem_1',
    'usr_demo',
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="%231e293b"/><text x="200" y="300" font-size="22" fill="%23fffc00" text-anchor="middle">First Saved Memory</text></svg>',
    'image',
    'Saved to my vault',
    now - 2 * 86400000
  );
}

module.exports = {
  MIGRATIONS,
  seedDatabase
};

