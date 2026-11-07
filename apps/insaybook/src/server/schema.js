'use strict';

/**
 * Insaybook — Database Schema & Initial Seeder
 */

const { hashPassword } = require('./core/auth.js');

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_insaybook_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        display_name TEXT NOT NULL,
        bio TEXT DEFAULT '',
        avatar_url TEXT DEFAULT '',
        cover_url TEXT DEFAULT '',
        hometown TEXT DEFAULT '',
        occupation TEXT DEFAULT '',
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

      CREATE TABLE IF NOT EXISTS friendships (
        requester_id TEXT NOT NULL,
        addressee_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined'
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (requester_id, addressee_id),
        FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        privacy TEXT NOT NULL DEFAULT 'public', -- 'public', 'private'
        icon_url TEXT DEFAULT '',
        cover_url TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member', -- 'admin', 'moderator', 'member'
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (group_id, user_id),
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        group_id TEXT,
        content TEXT NOT NULL,
        media_url TEXT DEFAULT '',
        media_type TEXT DEFAULT 'none',
        audience TEXT NOT NULL DEFAULT 'public', -- 'public', 'friends', 'private'
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS post_reactions (
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        reaction TEXT NOT NULL, -- 'like', 'love', 'haha', 'wow', 'sad', 'angry'
        created_at INTEGER NOT NULL,
        PRIMARY KEY (post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS post_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        location TEXT NOT NULL,
        event_date INTEGER NOT NULL,
        cover_url TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS event_rsvps (
        event_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL, -- 'going', 'interested', 'not_going'
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (event_id, user_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS marketplace_items (
        id TEXT PRIMARY KEY,
        seller_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        price REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        category TEXT NOT NULL,
        location TEXT NOT NULL,
        image_url TEXT NOT NULL,
        is_sold INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS messenger_messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        type TEXT NOT NULL, -- 'friend_request', 'friend_accept', 'group_invite', 'reaction', 'comment'
        target_id TEXT,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS blocks (
        blocker_id TEXT NOT NULL,
        blocked_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (blocker_id, blocked_id),
        FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
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
      id: 'usr_asha',
      username: 'ashapatel',
      email: 'asha@example.com',
      displayName: 'Asha Patel',
      bio: 'Community organizer, urban agriculture enthusiast, and neighborhood council volunteer.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%232875df"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">AP</text></svg>',
      coverUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240"><rect width="800" height="240" fill="%231a365d"/><text x="400" y="130" font-size="28" fill="white" text-anchor="middle">Neighbourhood Garden Collective</text></svg>',
      hometown: 'San Francisco, CA',
      occupation: 'Urban Planner'
    },
    {
      id: 'usr_marcus',
      username: 'marcusthompson',
      email: 'marcus@example.com',
      displayName: 'Marcus Thompson',
      bio: 'Avid trail runner, weekend hiking leader, and environmental educator.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%2318a999"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">MT</text></svg>',
      coverUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240"><rect width="800" height="240" fill="%23234e52"/><text x="400" y="130" font-size="28" fill="white" text-anchor="middle">Pacific Ridge Trails</text></svg>',
      hometown: 'Seattle, WA',
      occupation: 'Wilderness Guide'
    },
    {
      id: 'usr_elena',
      username: 'elenarostova',
      email: 'elena@example.com',
      displayName: 'Elena Rostova',
      bio: 'Woodworker, maker, and founder of the Local Craft Guild.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23f59e0b"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">ER</text></svg>',
      coverUrl: '',
      hometown: 'Portland, OR',
      occupation: 'Custom Furniture Builder'
    },
    {
      id: 'usr_demo',
      username: 'demo_user',
      email: 'demo@insaybook.local',
      displayName: 'Demo Community Member',
      bio: 'Connecting with neighbors, discovering local groups, and sharing updates.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%2310b981"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">DE</text></svg>',
      coverUrl: '',
      hometown: 'Austin, TX',
      occupation: 'Software Engineer'
    }
  ];

  for (const u of users) {
    db.run(
      `INSERT INTO users (id, username, email, password_hash, salt, display_name, bio, avatar_url, cover_url, hometown, occupation, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      u.id, u.username, u.email, defaultPw.hash, defaultPw.salt, u.displayName, u.bio, u.avatarUrl, u.coverUrl, u.hometown, u.occupation, now - 14 * 86400000
    );
  }

  // Seed Friends
  db.run('INSERT INTO friendships VALUES (?, ?, ?, ?, ?)', 'usr_asha', 'usr_marcus', 'accepted', now - 10 * 86400000, now - 9 * 86400000);
  db.run('INSERT INTO friendships VALUES (?, ?, ?, ?, ?)', 'usr_asha', 'usr_demo', 'accepted', now - 5 * 86400000, now - 4 * 86400000);
  db.run('INSERT INTO friendships VALUES (?, ?, ?, ?, ?)', 'usr_elena', 'usr_demo', 'pending', now - 2 * 3600000, now - 2 * 3600000);

  // Seed Groups
  const groups = [
    {
      id: 'grp_garden',
      creatorId: 'usr_asha',
      name: 'Neighbourhood Garden Collective',
      description: 'A shared community space for vegetable growers, composters, and garden enthusiasts.',
      privacy: 'public'
    },
    {
      id: 'grp_hikers',
      creatorId: 'usr_marcus',
      name: 'Weekend Hikers & Trail Scouts',
      description: 'Organizing group hikes across state parks and scenic ridges every Saturday.',
      privacy: 'public'
    },
    {
      id: 'grp_makers',
      creatorId: 'usr_elena',
      name: 'Makers & Woodworkers Guild',
      description: 'Showcasing woodworking, laser cutting, metal craft, and repair projects.',
      privacy: 'public'
    }
  ];

  for (const g of groups) {
    db.run(
      'INSERT INTO groups VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      g.id, g.creatorId, g.name, g.description, g.privacy, '', '', now - 12 * 86400000
    );
    // Add creator as admin
    db.run('INSERT INTO group_members VALUES (?, ?, ?, ?)', g.id, g.creatorId, 'admin', now - 12 * 86400000);
    // Add demo user as member
    db.run('INSERT INTO group_members VALUES (?, ?, ?, ?)', g.id, 'usr_demo', 'member', now - 6 * 86400000);
  }

  // Seed Community Events
  const events = [
    {
      id: 'ev_1',
      creatorId: 'usr_asha',
      title: 'Spring Garden Seed & Seedling Swap',
      description: 'Bring heirloom seeds, cuttings, and tomato starts to exchange with neighbors!',
      location: 'Community Garden Plot 4, Elm St.',
      date: now + 5 * 86400000
    },
    {
      id: 'ev_2',
      creatorId: 'usr_marcus',
      title: 'Mount Tamalpais Sunrise Summit Hike',
      description: 'Moderate 7-mile loop trail. Headlamps required. Coffee and breakfast picnic at summit.',
      location: 'Pantoll Ranger Station Trailhead',
      date: now + 3 * 86400000
    }
  ];

  for (const ev of events) {
    db.run(
      'INSERT INTO events VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ev.id, ev.creatorId, ev.title, ev.description, ev.location, ev.date, '', now - 3 * 86400000
    );
    db.run('INSERT INTO event_rsvps VALUES (?, ?, ?, ?)', ev.id, 'usr_demo', 'going', now);
    db.run('INSERT INTO event_rsvps VALUES (?, ?, ?, ?)', ev.id, ev.creatorId, 'going', now);
  }

  // Seed Marketplace Items
  const items = [
    {
      id: 'mkt_1',
      sellerId: 'usr_elena',
      title: 'Handmade Solid White Oak Coffee Table',
      description: 'Built with traditional mortise-and-tenon joinery and finished with natural hardwax oil.',
      price: 340.0,
      category: 'Furniture',
      location: 'Portland, OR',
      imageUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%2378350f"/><rect x="50" y="80" width="300" height="40" rx="6" fill="%23d97706"/><rect x="80" y="120" width="20" height="120" fill="%23b45309"/><rect x="300" y="120" width="20" height="120" fill="%23b45309"/><text x="200" y="270" font-size="20" fill="white" text-anchor="middle">Oak Coffee Table</text></svg>'
    },
    {
      id: 'mkt_2',
      sellerId: 'usr_asha',
      title: 'Set of 4 Terracotta Herb Planters with Drainage Trays',
      description: 'Clean, unglazed Italian terracotta planters perfect for kitchen basil, rosemary, and thyme.',
      price: 25.0,
      category: 'Garden',
      location: 'San Francisco, CA',
      imageUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="%232e1065"/><circle cx="120" cy="150" r="50" fill="%23c2410c"/><circle cx="280" cy="150" r="50" fill="%23c2410c"/><text x="200" y="260" font-size="20" fill="white" text-anchor="middle">Terracotta Planters</text></svg>'
    }
  ];

  for (const item of items) {
    db.run(
      'INSERT INTO marketplace_items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      item.id, item.sellerId, item.title, item.description, item.price, 'USD', item.category, item.location, item.imageUrl, 0, now - 2 * 86400000
    );
  }

  // Seed News Feed Posts
  const posts = [
    {
      id: 'bk_post_1',
      userId: 'usr_asha',
      groupId: 'grp_garden',
      content: 'The neighbourhood community garden is thriving! The winter cover crops replenished the nitrogen levels, and the heirloom tomatoes are ready for transplanting. Who is coming to Saturday’s seedling swap?',
      mediaUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23064e3b"/><circle cx="300" cy="200" r="120" fill="%23059669"/><text x="300" y="210" font-size="26" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">Community Garden In Bloom</text></svg>',
      mediaType: 'image',
      audience: 'public',
      created: now - 3600000 * 3
    },
    {
      id: 'bk_post_2',
      userId: 'usr_marcus',
      groupId: 'grp_hikers',
      content: 'Saturday trail plan is set! All levels welcome for our Pacific Ridge loop. Bring plenty of water and sun protection. Check the Events tab for RSVP details.',
      mediaUrl: '',
      mediaType: 'none',
      audience: 'public',
      created: now - 3600000 * 6
    }
  ];

  for (const p of posts) {
    db.run(
      'INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      p.id, p.userId, p.groupId, p.content, p.mediaUrl, p.mediaType, p.audience, p.created
    );
    // Add reactions
    db.run('INSERT INTO post_reactions VALUES (?, ?, ?, ?)', p.id, 'usr_asha', 'love', p.created);
    db.run('INSERT INTO post_reactions VALUES (?, ?, ?, ?)', p.id, 'usr_marcus', 'like', p.created);
    db.run('INSERT INTO post_comments VALUES (?, ?, ?, ?, ?)', `cm_${p.id}`, p.id, 'usr_elena', 'Count me in for this!', p.created + 60000);
  }
}

module.exports = {
  MIGRATIONS,
  seedDatabase
};
