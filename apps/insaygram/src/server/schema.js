'use strict';

/**
 * Insaygram — Database Schema & Initial Seeder
 */

const { hashPassword } = require('./core/auth.js');

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_insaygram_schema',
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
        is_private INTEGER DEFAULT 0,
        is_verified INTEGER DEFAULT 0,
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

      CREATE TABLE IF NOT EXISTS follows (
        follower_id TEXT NOT NULL,
        following_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (follower_id, following_id),
        FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        caption TEXT DEFAULT '',
        location TEXT DEFAULT '',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS post_media (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        media_url TEXT NOT NULL,
        media_type TEXT NOT NULL,
        aspect_ratio REAL DEFAULT 1.0,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        media_url TEXT NOT NULL,
        media_type TEXT NOT NULL,
        caption TEXT DEFAULT '',
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS story_views (
        story_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        viewed_at INTEGER NOT NULL,
        PRIMARY KEY (story_id, user_id),
        FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS reels (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        video_url TEXT NOT NULL,
        caption TEXT DEFAULT '',
        audio_title TEXT DEFAULT 'Original Audio',
        duration INTEGER DEFAULT 15,
        views INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS likes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        target_type TEXT NOT NULL, -- 'post', 'reel', 'comment'
        target_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (user_id, target_type, target_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        parent_id TEXT,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS saves (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        post_id TEXT NOT NULL,
        collection_name TEXT DEFAULT 'All Posts',
        created_at INTEGER NOT NULL,
        UNIQUE (user_id, post_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        text TEXT DEFAULT '',
        media_url TEXT DEFAULT '',
        is_read INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        type TEXT NOT NULL, -- 'like', 'comment', 'follow', 'dm'
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
  if (userCount > 0) return; // Already seeded

  const now = Date.now();
  const defaultPw = hashPassword('InsayPassword123!');

  // Seed default community creators
  const users = [
    {
      id: 'usr_mira',
      username: 'mirachen',
      email: 'mira@example.com',
      displayName: 'Mira Chen',
      bio: 'Architectural photographer & slower living advocate. Kyoto / Tokyo.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23d9468f"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">MC</text></svg>',
      isVerified: 1
    },
    {
      id: 'usr_noah',
      username: 'noahrivera',
      email: 'noah@example.com',
      displayName: 'Noah Rivera',
      bio: 'Analog photography. Light studies & golden hour captures.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%238b5cf6"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">NR</text></svg>',
      isVerified: 1
    },
    {
      id: 'usr_forma',
      username: 'studioforma',
      email: 'forma@example.com',
      displayName: 'Studio Forma',
      bio: 'Minimalist industrial design, ceramics, and tactile material studies.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23ec4899"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">SF</text></svg>',
      isVerified: 1
    },
    {
      id: 'usr_demo',
      username: 'demo_user',
      email: 'demo@insaygram.local',
      displayName: 'Demo Explorer',
      bio: 'Exploring the Insaygram visual ecosystem. Ready to capture life in every frame.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%2310b981"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">DE</text></svg>',
      isVerified: 0
    }
  ];

  for (const u of users) {
    db.run(
      `INSERT INTO users (id, username, email, password_hash, salt, display_name, bio, avatar_url, is_verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      u.id,
      u.username,
      u.email,
      defaultPw.hash,
      defaultPw.salt,
      u.displayName,
      u.bio,
      u.avatarUrl,
      u.isVerified,
      now - 7 * 86400000
    );
  }

  // Follow relationships
  db.run('INSERT INTO follows VALUES (?, ?, ?)', 'usr_demo', 'usr_mira', now - 86400000);
  db.run('INSERT INTO follows VALUES (?, ?, ?)', 'usr_demo', 'usr_noah', now - 86400000);
  db.run('INSERT INTO follows VALUES (?, ?, ?)', 'usr_mira', 'usr_forma', now - 86400000);

  // Seed sample posts
  const posts = [
    {
      id: 'post_1',
      userId: 'usr_mira',
      caption: 'A quiet morning in Kyoto. Shadows shifting across hand-carved cedar wooden panels.',
      location: 'Kyoto, Japan',
      media: [
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%232d3748"/><stop offset="100%" stop-color="%231a202c"/></linearGradient></defs><rect width="600" height="600" fill="url(%23g1)"/><circle cx="300" cy="250" r="140" fill="%23d9468f" opacity="0.8"/><rect x="180" y="320" width="240" height="150" rx="10" fill="%238b5cf6" opacity="0.6"/><text x="300" y="520" font-family="sans-serif" font-size="24" fill="%23edf2f7" text-anchor="middle">Kyoto Temple Light Study</text></svg>'
      ],
      created: now - 3600000 * 2
    },
    {
      id: 'post_2',
      userId: 'usr_noah',
      caption: 'Light studies, vol. 04. 35mm film exposure right before dusk.',
      location: 'Big Sur, California',
      media: [
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><defs><radialGradient id="g2" cx="70%" cy="30%" r="80%"><stop offset="0%" stop-color="%23f6ad55"/><stop offset="50%" stop-color="%23dd6b20"/><stop offset="100%" stop-color="%237b341e"/></radialGradient></defs><rect width="600" height="600" fill="url(%23g2)"/><circle cx="450" cy="180" r="80" fill="%23feebc8" opacity="0.9"/><text x="300" y="530" font-family="sans-serif" font-size="24" fill="%23ffffff" text-anchor="middle">Golden Hour Coastal Exposure</text></svg>'
      ],
      created: now - 3600000 * 5
    },
    {
      id: 'post_3',
      userId: 'usr_forma',
      caption: 'Objects for slower living. Raw stoneware fired with natural wood ash glaze.',
      location: 'Copenhagen Design Studio',
      media: [
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><defs><linearGradient id="g3" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="%231a365d"/><stop offset="100%" stop-color="%232b6cb0"/></linearGradient></defs><rect width="600" height="600" fill="url(%23g3)"/><polygon points="300,100 450,450 150,450" fill="%2363b3ed" opacity="0.8"/><text x="300" y="520" font-family="sans-serif" font-size="24" fill="%23ebf8ff" text-anchor="middle">Tactile Ceramic Vessels</text></svg>'
      ],
      created: now - 3600000 * 8
    }
  ];

  for (const p of posts) {
    db.run('INSERT INTO posts VALUES (?, ?, ?, ?, ?)', p.id, p.userId, p.caption, p.location, p.created);
    p.media.forEach((url, idx) => {
      db.run('INSERT INTO post_media VALUES (?, ?, ?, ?, ?, ?)', `pm_${p.id}_${idx}`, p.id, url, 'image', 1.0, idx);
    });
    // Add initial likes
    db.run('INSERT INTO likes VALUES (?, ?, ?, ?, ?)', `lk_${p.id}_1`, 'usr_mira', 'post', p.id, p.created);
    db.run('INSERT INTO likes VALUES (?, ?, ?, ?, ?)', `lk_${p.id}_2`, 'usr_noah', 'post', p.id, p.created);
  }

  // Seed sample stories (expiring in 24h)
  const stories = [
    {
      id: 'st_1',
      userId: 'usr_mira',
      caption: 'Work in progress print proofs',
      mediaUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700" viewBox="0 0 400 700"><rect width="400" height="700" fill="%232c5282"/><text x="200" y="350" font-family="sans-serif" font-size="24" fill="white" text-anchor="middle">Darkroom Proofs</text></svg>',
      expiresAt: now + 20 * 3600000,
      createdAt: now - 4 * 3600000
    },
    {
      id: 'st_2',
      userId: 'usr_noah',
      caption: 'Dawn hike at the ridge',
      mediaUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700" viewBox="0 0 400 700"><rect width="400" height="700" fill="%23c05621"/><text x="200" y="350" font-family="sans-serif" font-size="24" fill="white" text-anchor="middle">Sunrise Ridge</text></svg>',
      expiresAt: now + 18 * 3600000,
      createdAt: now - 6 * 3600000
    }
  ];

  for (const s of stories) {
    db.run('INSERT INTO stories VALUES (?, ?, ?, ?, ?, ?, ?)', s.id, s.userId, s.mediaUrl, 'image', s.caption, s.expiresAt, s.createdAt);
  }

  // Seed sample reels
  const reels = [
    {
      id: 'reel_1',
      userId: 'usr_mira',
      videoUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700" viewBox="0 0 400 700"><rect width="400" height="700" fill="%234a5568"/><circle cx="200" cy="350" r="60" fill="%23e2e8f0"/><polygon points="190,320 230,350 190,380" fill="%232d3748"/><text x="200" y="460" font-family="sans-serif" font-size="20" fill="white" text-anchor="middle">Analog Darkroom Development</text></svg>',
      caption: 'Watching silver halides come to life in the developer tray. Pure magic every time.',
      audioTitle: 'Mira Chen • Darkroom Ambience',
      views: 1420
    },
    {
      id: 'reel_2',
      userId: 'usr_forma',
      videoUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700" viewBox="0 0 400 700"><rect width="400" height="700" fill="%23702459"/><circle cx="200" cy="350" r="60" fill="%23fed7e2"/><polygon points="190,320 230,350 190,380" fill="%23521b41"/><text x="200" y="460" font-family="sans-serif" font-size="20" fill="white" text-anchor="middle">Throwing Porcelain on the Wheel</text></svg>',
      caption: 'Centering 4kg of white porcelain clay. Flow state in the studio.',
      audioTitle: 'Studio Forma • Wheel Drone Vol. 1',
      views: 3180
    }
  ];

  for (const r of reels) {
    db.run('INSERT INTO reels VALUES (?, ?, ?, ?, ?, ?, ?, ?)', r.id, r.userId, r.videoUrl, r.caption, r.audioTitle, 15, r.views, now - 12 * 3600000);
  }
}

module.exports = {
  MIGRATIONS,
  seedDatabase
};

