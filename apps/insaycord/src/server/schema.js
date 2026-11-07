'use strict';

/**
 * Insaycord — Database Schema & Initial Seeder
 */

const { hashPassword } = require('./core/auth.js');

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_insaycord_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_url TEXT DEFAULT '',
        status TEXT DEFAULT 'online', -- 'online', 'idle', 'dnd', 'offline'
        custom_status TEXT DEFAULT '',
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

      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        icon_url TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS server_members (
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        nickname TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'moderator', 'member'
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (server_id, user_id),
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'text', -- 'text', 'voice'
        topic TEXT DEFAULT '',
        position INTEGER DEFAULT 0,
        is_private INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT NOT NULL,
        media_url TEXT DEFAULT '',
        is_pinned INTEGER DEFAULT 0,
        is_edited INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS message_reactions (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        emoji TEXT NOT NULL,
        PRIMARY KEY (message_id, user_id, emoji),
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS direct_conversations (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS direct_members (
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY (conversation_id, user_id),
        FOREIGN KEY (conversation_id) REFERENCES direct_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT NOT NULL,
        media_url TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES direct_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS invites (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        inviter_id TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        max_uses INTEGER DEFAULT 0,
        uses INTEGER DEFAULT 0,
        expires_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
        FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE
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
  const defaultPw = hashPassword('insaypass123');

  const users = [
    {
      id: 'usr_alex',
      username: 'alex_architect',
      email: 'alex@example.com',
      displayName: 'Alex Rivers',
      status: 'online',
      customStatus: 'Coding distributed systems 🚀',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%235865f2"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">AR</text></svg>'
    },
    {
      id: 'usr_sam',
      username: 'sam_systems',
      email: 'sam@example.com',
      displayName: 'Sam Taylor',
      status: 'idle',
      customStatus: 'In voice lounge 🎧',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%233ba55d"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">ST</text></svg>'
    },
    {
      id: 'usr_jordan',
      username: 'jordan_maker',
      email: 'jordan@example.com',
      displayName: 'Jordan Spark',
      status: 'dnd',
      customStatus: 'Shipping v2.0 release',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%23eb459e"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">JS</text></svg>'
    },
    {
      id: 'usr_demo',
      username: 'demo_user',
      email: 'demo@insaycord.local',
      displayName: 'Demo Collaborator',
      status: 'online',
      customStatus: 'Exploring community channels',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%2310b981"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">DE</text></svg>'
    }
  ];

  for (const u of users) {
    db.run(
      `INSERT INTO users (id, username, email, password_hash, salt, display_name, avatar_url, status, custom_status, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      u.id, u.username, u.email, defaultPw.hash, defaultPw.salt, u.displayName, u.avatarUrl, u.status, u.customStatus, 0, now - 14 * 86400000
    );
  }

  // Seed Communities (Servers)
  const servers = [
    {
      id: 'srv_workshop',
      ownerId: 'usr_alex',
      name: 'The Workshop',
      description: 'Collaborative development, code reviews, and architecture debates.',
      channels: [
        { id: 'chn_gen', name: 'general', type: 'text', topic: 'General open discussion' },
        { id: 'chn_arch', name: 'architecture', type: 'text', topic: 'System blueprints and specs' },
        { id: 'chn_voice1', name: 'Lounge Voice', type: 'voice', topic: 'Casual audio hangout' },
        { id: 'chn_voice2', name: 'Deep Work Audio', type: 'voice', topic: 'Quiet co-working room' }
      ]
    },
    {
      id: 'srv_study',
      ownerId: 'usr_sam',
      name: 'Study Hall',
      description: 'Quiet co-working and focused learning.',
      channels: [
        { id: 'chn_focus', name: 'focus-room', type: 'text', topic: 'Pomodoro timer and logs' },
        { id: 'chn_res', name: 'resources', type: 'text', topic: 'Curated papers and books' },
        { id: 'chn_study_voice', name: 'Study Voice', type: 'voice', topic: 'Silent co-working room' }
      ]
    }
  ];

  for (const s of servers) {
    db.run(
      'INSERT OR IGNORE INTO servers VALUES (?, ?, ?, ?, ?, ?)',
      s.id, s.ownerId, s.name, s.description, '', now - 10 * 86400000
    );

    // Add members
    db.run('INSERT OR IGNORE INTO server_members VALUES (?, ?, ?, ?, ?)', s.id, s.ownerId, 'Server Founder', 'owner', now - 10 * 86400000);
    if (s.ownerId !== 'usr_sam') {
      db.run('INSERT OR IGNORE INTO server_members VALUES (?, ?, ?, ?, ?)', s.id, 'usr_sam', 'Moderator', 'admin', now - 9 * 86400000);
    }
    db.run('INSERT OR IGNORE INTO server_members VALUES (?, ?, ?, ?, ?)', s.id, 'usr_jordan', '', 'member', now - 8 * 86400000);
    db.run('INSERT OR IGNORE INTO server_members VALUES (?, ?, ?, ?, ?)', s.id, 'usr_demo', 'Demo Guest', 'member', now - 7 * 86400000);

    // Add channels
    s.channels.forEach((ch, idx) => {
      db.run(
        'INSERT OR IGNORE INTO channels VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ch.id, s.id, ch.name, ch.type, ch.topic, idx, 0, now - 10 * 86400000
      );
    });

    // Seed sample messages
    db.run(
      'INSERT OR IGNORE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      `msg_${s.id}_1`,
      s.channels[0].id,
      s.ownerId,
      `Welcome everyone to **${s.name}**! Check out our channels on the left.`,
      '',
      1,
      0,
      now - 3600000 * 5,
      now - 3600000 * 5
    );

    db.run(
      'INSERT OR IGNORE INTO messages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      `msg_${s.id}_2`,
      s.channels[0].id,
      'usr_sam',
      'Voice room signaling is active. Feel free to join \`Lounge Voice\` anytime!',
      '',
      0,
      0,
      now - 3600000 * 2,
      now - 3600000 * 2
    );

    // Reactions
    db.run('INSERT OR IGNORE INTO message_reactions VALUES (?, ?, ?)', `msg_${s.id}_1`, 'usr_demo', '🚀');
    db.run('INSERT OR IGNORE INTO message_reactions VALUES (?, ?, ?)', `msg_${s.id}_1`, 'usr_sam', '❤️');
  }

  // Seed sample invite
  db.run('INSERT OR IGNORE INTO invites VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'inv_1', 'srv_workshop', 'usr_alex', 'workshop-open', 100, 4, null, now - 86400000);
}

module.exports = {
  MIGRATIONS,
  seedDatabase
};
