'use strict';

/**
 * Insaytok — Database Schema & Initial Seeder
 */

const { hashPassword } = require('./core/auth.js');

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_insaytok_schema',
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
        follower_count INTEGER DEFAULT 0,
        following_count INTEGER DEFAULT 0,
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

      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        video_url TEXT NOT NULL,
        thumbnail_url TEXT DEFAULT '',
        caption TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        sound_title TEXT DEFAULT 'Original Sound',
        duration INTEGER DEFAULT 15,
        view_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        share_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS video_likes (
        video_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (video_id, user_id),
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS video_comments (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS video_saves (
        video_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (video_id, user_id),
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
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

      CREATE TABLE IF NOT EXISTS watch_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        video_id TEXT NOT NULL,
        completion_rate REAL DEFAULT 1.0,
        watched_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
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
      id: 'usr_earth',
      username: 'earth.minute',
      email: 'earth@example.com',
      displayName: 'Earth Minute',
      bio: 'Bioluminescent deep sea & nature phenomena explained in 60s.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%2316c7c2"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">EM</text></svg>'
    },
    {
      id: 'usr_lee',
      username: 'buildwithlee',
      email: 'lee@example.com',
      displayName: 'Lee Chen',
      bio: 'Minimalist desk setups, mechanical keyboards, and maker DIY hacks.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%23ee3d68"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">LC</text></svg>'
    },
    {
      id: 'usr_motion',
      username: 'motionlab',
      email: 'motion@example.com',
      displayName: 'Motion Lab',
      bio: 'Kinetic typography, 3D blender simulations, and visual rhythm.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%238b5cf6"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">ML</text></svg>'
    },
    {
      id: 'usr_demo',
      username: 'demo_user',
      email: 'demo@insaytok.local',
      displayName: 'Demo Creator',
      bio: 'Short video explorer on Insaytok.',
      avatarUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%2310b981"/><text x="50" y="62" font-size="38" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">DE</text></svg>'
    }
  ];

  for (const u of users) {
    db.run(
      `INSERT INTO users (id, username, email, password_hash, salt, display_name, bio, avatar_url, follower_count, following_count, is_admin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      u.id, u.username, u.email, defaultPw.hash, defaultPw.salt, u.displayName, u.bio, u.avatarUrl, 1420, 48, 0, now - 14 * 86400000
    );
  }

  // Seed sample vertical videos
  const videos = [
    {
      id: 'tok_1',
      userId: 'usr_earth',
      videoUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="450" height="800" viewBox="0 0 450 800"><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%23022c43"/><stop offset="50%" stop-color="%23053f5e"/><stop offset="100%" stop-color="%23115173"/></linearGradient></defs><rect width="450" height="800" fill="url(%23g1)"/><circle cx="225" cy="400" r="110" fill="%2316c7c2" opacity="0.8"/><text x="225" y="410" font-size="28" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">Bioluminescent Waves</text></svg>',
      caption: 'Why does the Pacific ocean glow neon blue at midnight? The science of dinoflagellates 🌊 #science #ocean #nature',
      tags: 'science, ocean, nature, earth',
      soundTitle: 'Ocean Waves • Ambient Lab',
      views: 18450,
      likes: 3420,
      comments: 218,
      created: now - 3600000 * 4
    },
    {
      id: 'tok_2',
      userId: 'usr_lee',
      videoUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="450" height="800" viewBox="0 0 450 800"><defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="%232b0938"/><stop offset="50%" stop-color="%23531253"/><stop offset="100%" stop-color="%23841e62"/></linearGradient></defs><rect width="450" height="800" fill="url(%23g2)"/><rect x="75" y="300" width="300" height="200" rx="16" fill="%23ee3d68" opacity="0.8"/><text x="225" y="410" font-size="26" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">Custom Walnut Desk Shelf</text></svg>',
      caption: 'One tiny desk upgrade that changed my entire workflow forever. Custom walnut monitor riser. ⌨️ #diy #desksetup #workspace',
      tags: 'diy, desksetup, workspace, tech',
      soundTitle: 'Lo-Fi Chill Beat • Lee Chen',
      views: 29800,
      likes: 6240,
      comments: 489,
      created: now - 3600000 * 8
    },
    {
      id: 'tok_3',
      userId: 'usr_motion',
      videoUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="450" height="800" viewBox="0 0 450 800"><defs><linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%230f172a"/><stop offset="100%" stop-color="%231e1b4b"/></linearGradient></defs><rect width="450" height="800" fill="url(%23g3)"/><polygon points="225,250 350,550 100,550" fill="%238b5cf6" opacity="0.85"/><text x="225" y="430" font-size="26" font-family="sans-serif" font-weight="bold" fill="white" text-anchor="middle">12s Geometric Kinetic Loop</text></svg>',
      caption: 'A 12-second kinetic typography and 3D geometry study rendered in Blender. 🎨 #animation #3d #design',
      tags: 'animation, 3d, design, motion',
      soundTitle: 'Kinetic Synth • Motion Lab',
      views: 9400,
      likes: 1890,
      comments: 112,
      created: now - 3600000 * 12
    }
  ];

  for (const v of videos) {
    db.run(
      `INSERT INTO videos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      v.id, v.userId, v.videoUrl, '', v.caption, v.tags, v.soundTitle, 15, v.views, v.likes, v.comments, 45, v.created
    );
    // Seed initial likes
    db.run('INSERT INTO video_likes VALUES (?, ?, ?)', v.id, 'usr_demo', v.created);
    // Seed initial comments
    db.run('INSERT INTO video_comments VALUES (?, ?, ?, ?, ?)', `cm_${v.id}`, v.id, 'usr_lee', 'Super clean production quality!', v.created + 60000);
  }

  // Follows
  db.run('INSERT INTO follows VALUES (?, ?, ?)', 'usr_demo', 'usr_earth', now - 86400000);
  db.run('INSERT INTO follows VALUES (?, ?, ?)', 'usr_demo', 'usr_lee', now - 86400000);
}

module.exports = {
  MIGRATIONS,
  seedDatabase
};

