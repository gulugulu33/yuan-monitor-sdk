import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.APM_DATA_DIR || path.resolve(__dirname, '../../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'apm.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS apps (
    app_key   TEXT PRIMARY KEY,
    name      TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  -- 错误聚合表（issue）：同一 fingerprint 的错误事件聚合成一条
  CREATE TABLE IF NOT EXISTS error_issues (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    app_key      TEXT NOT NULL,
    fingerprint  TEXT NOT NULL,
    type         TEXT NOT NULL,
    message      TEXT NOT NULL DEFAULT '',
    stack        TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'unresolved',
    count        INTEGER NOT NULL DEFAULT 0,
    first_seen   INTEGER NOT NULL,
    last_seen    INTEGER NOT NULL,
    UNIQUE(app_key, fingerprint)
  );
  CREATE INDEX IF NOT EXISTS idx_issues_app_last ON error_issues(app_key, last_seen DESC);

  -- 错误事件表：每次错误发生的完整上下文
  CREATE TABLE IF NOT EXISTS error_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id     INTEGER NOT NULL REFERENCES error_issues(id) ON DELETE CASCADE,
    app_key      TEXT NOT NULL,
    session_id   TEXT NOT NULL DEFAULT '',
    user_id      TEXT NOT NULL DEFAULT '',
    page_url     TEXT NOT NULL DEFAULT '',
    user_agent   TEXT NOT NULL DEFAULT '',
    type         TEXT NOT NULL DEFAULT '',
    sub_type     TEXT NOT NULL DEFAULT '',
    message      TEXT NOT NULL DEFAULT '',
    stack        TEXT NOT NULL DEFAULT '',
    file         TEXT NOT NULL DEFAULT '',
    line         INTEGER,
    col          INTEGER,
    breadcrumbs  TEXT NOT NULL DEFAULT '[]',
    context      TEXT NOT NULL DEFAULT '{}',
    extra        TEXT NOT NULL DEFAULT '{}',
    timestamp    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_issue_ts ON error_events(issue_id, timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_events_session ON error_events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_app_ts ON error_events(app_key, timestamp DESC);

  CREATE TABLE IF NOT EXISTS performance_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    app_key     TEXT NOT NULL,
    session_id  TEXT NOT NULL DEFAULT '',
    user_id     TEXT NOT NULL DEFAULT '',
    page_url    TEXT NOT NULL DEFAULT '',
    sub_type    TEXT NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    value       REAL,
    detail      TEXT NOT NULL DEFAULT '{}',
    timestamp   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_perf_app_sub_ts ON performance_events(app_key, sub_type, timestamp DESC);

  CREATE TABLE IF NOT EXISTS behavior_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    app_key     TEXT NOT NULL,
    session_id  TEXT NOT NULL DEFAULT '',
    user_id     TEXT NOT NULL DEFAULT '',
    sub_type    TEXT NOT NULL,
    data        TEXT NOT NULL DEFAULT '{}',
    timestamp   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_behavior_session ON behavior_events(session_id, timestamp);

  CREATE TABLE IF NOT EXISTS session_replays (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    app_key      TEXT NOT NULL,
    session_id   TEXT NOT NULL DEFAULT '',
    user_id      TEXT NOT NULL DEFAULT '',
    event_count  INTEGER NOT NULL DEFAULT 0,
    duration     INTEGER NOT NULL DEFAULT 0,
    error_count  INTEGER NOT NULL DEFAULT 0,
    error_offset INTEGER NOT NULL DEFAULT -1,
    events       TEXT NOT NULL DEFAULT '[]',
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_replays_session ON session_replays(app_key, session_id);
  CREATE INDEX IF NOT EXISTS idx_replays_created ON session_replays(created_at DESC);
`);

export default db;
