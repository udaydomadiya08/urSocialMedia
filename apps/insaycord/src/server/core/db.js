'use strict';

/**
 * Insay Social Ecosystem — Resilient Database Layer
 * Zero-dependency embedded SQLite with ACID transactions, WAL mode, and migrations.
 * Uses Node 22+ built-in `node:sqlite` (DatabaseSync).
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

class DatabaseManager {
  constructor(dbFilePath) {
    this.dbFilePath = dbFilePath;
    const dbDir = path.dirname(dbFilePath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new DatabaseSync(dbFilePath);
    this.initPragmas();
  }

  initPragmas() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params) => stmt.run(...params),
      get: (...params) => stmt.get(...params),
      all: (...params) => stmt.all(...params)
    };
  }

  run(sql, ...params) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  get(sql, ...params) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params);
  }

  all(sql, ...params) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  transaction(fn) {
    this.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const result = fn(this);
      this.exec('COMMIT;');
      return result;
    } catch (err) {
      this.exec('ROLLBACK;');
      throw err;
    }
  }

  runMigrations(migrations) {
    this.exec(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );
    `);

    const appliedRows = this.all('SELECT version FROM _schema_migrations ORDER BY version ASC');
    const appliedVersions = new Set(appliedRows.map(r => r.version));

    for (const migration of migrations) {
      if (!appliedVersions.has(migration.version)) {
        this.transaction(tx => {
          tx.exec(migration.sql);
          tx.run(
            'INSERT INTO _schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
            migration.version,
            migration.name,
            Date.now()
          );
        });
      }
    }
  }

  close() {
    this.db.close();
  }
}

function createDatabase(filePath) {
  return new DatabaseManager(filePath);
}

module.exports = {
  DatabaseManager,
  createDatabase
};
