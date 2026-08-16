import db from '../db/index.js';
import { computeFingerprint } from './fingerprint.js';

const upsertApp = db.prepare(
  `INSERT INTO apps (app_key, name, created_at) VALUES (?, ?, ?)
   ON CONFLICT(app_key) DO NOTHING`
);

const getIssue = db.prepare(
  `SELECT id FROM error_issues WHERE app_key = ? AND fingerprint = ?`
);

const insertIssue = db.prepare(
  `INSERT INTO error_issues (app_key, fingerprint, type, message, stack, first_seen, last_seen)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const touchIssue = db.prepare(
  `UPDATE error_issues SET count = count + 1, last_seen = MAX(last_seen, ?) WHERE id = ?`
);

const insertErrorEvent = db.prepare(
  `INSERT INTO error_events
     (issue_id, app_key, session_id, user_id, page_url, user_agent, type, sub_type,
      message, stack, file, line, col, breadcrumbs, context, extra, timestamp)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const insertPerfEvent = db.prepare(
  `INSERT INTO performance_events
     (app_key, session_id, user_id, page_url, sub_type, name, value, detail, timestamp)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const insertBehaviorEvent = db.prepare(
  `INSERT INTO behavior_events (app_key, session_id, user_id, sub_type, data, timestamp)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const insertReplay = db.prepare(
  `INSERT INTO session_replays
     (app_key, session_id, user_id, event_count, duration, error_count, error_offset, events, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

function safeJson(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try { JSON.parse(value); return value; } catch { return fallback; }
  }
  try { return JSON.stringify(value); } catch { return fallback; }
}

function ingestError(appKey, sessionId, userId, env, item, ts) {
  const err = item.errorData || {};
  const fingerprint = computeFingerprint(item);
  const type = item.subType || err.type || 'unknown';

  let issue = getIssue.get(appKey, fingerprint);
  if (!issue) {
    const info = insertIssue.run(
      appKey, fingerprint, type,
      err.message || '', err.stack || '', ts, ts
    );
    issue = { id: info.lastInsertRowid };
  } else {
    touchIssue.run(ts, issue.id);
  }

  const extra = {
    componentName: err.componentName,
    info: err.info,
    componentStack: err.componentStack,
    tagName: err.tagName,
    outerHTML: err.outerHTML,
    source: err.source || err.url
  };

  insertErrorEvent.run(
    issue.id, appKey, sessionId, userId || '',
    env.url || '',
    env.userAgent || '',
    type, type,
    err.message || '',
    err.stack || '',
    typeof err.source === 'string' ? err.source : (err.url || ''),
    Number.isFinite(err.lineno) ? err.lineno : null,
    Number.isFinite(err.colno) ? err.colno : null,
    safeJson(item.breadcrumbs, '[]'),
    safeJson(err.context, '{}'),
    safeJson(extra, '{}'),
    ts
  );
}

function ingestPerformance(appKey, sessionId, userId, env, item, ts) {
  const subType = item.subType || item.type || 'unknown';

  let name = '';
  let value = null;
  switch (subType) {
    case 'web-vital':
      name = item.name || '';
      value = typeof item.value === 'number' ? item.value : null;
      break;
    case 'resource':
      name = item.name || item.url || '';
      value = typeof item.duration === 'number' ? item.duration : null;
      break;
    case 'long-task':
      name = 'long-task';
      value = typeof item.duration === 'number' ? item.duration : null;
      break;
    case 'memory':
      name = 'usedJSHeapSize';
      value = typeof item.usedJSHeapSize === 'number' ? item.usedJSHeapSize : null;
      break;
    default:
      name = item.name || '';
      value = typeof item.value === 'number' ? item.value : null;
  }

  const detail = { ...item };
  delete detail.type;
  delete detail.subType;
  delete detail.timestamp;

  insertPerfEvent.run(
    appKey, sessionId, userId || '',
    env.url || '', subType, name, value,
    safeJson(detail, '{}'), ts
  );
}

function ingestBehavior(appKey, sessionId, userId, item, ts) {
  const detail = { ...item };
  delete detail.type;
  delete detail.subType;
  delete detail.timestamp;
  insertBehaviorEvent.run(
    appKey, sessionId, userId || '',
    item.subType || item.type || 'unknown',
    safeJson(detail, '{}'), ts
  );
}

/**
 * 处理一次批量上报：{ appKey, sessionId, userId, userData, data: [...], timestamp, environment }
 */
export function ingestReport(payload) {
  const appKey = payload?.appKey;
  const items = Array.isArray(payload?.data) ? payload.data : null;
  if (!appKey || !items) return { accepted: false, reason: 'invalid payload' };

  const sessionId = payload.sessionId || '';
  const userId = payload.userId || '';
  const env = payload.environment || {};

  upsertApp.run(appKey, '', payload.timestamp || Date.now());

  const counts = { error: 0, performance: 0, behavior: 0 };
  const ts = payload.timestamp || Date.now();

  db.transaction(() => {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const itemTs = Number.isFinite(item.timestamp) ? item.timestamp : ts;
      switch (item.type) {
        case 'error':
          ingestError(appKey, sessionId, userId, env, item, itemTs);
          counts.error++;
          break;
        case 'performance':
          ingestPerformance(appKey, sessionId, userId, env, item, itemTs);
          counts.performance++;
          break;
        case 'behavior':
          ingestBehavior(appKey, sessionId, userId, item, itemTs);
          counts.behavior++;
          break;
        default:
          break;
      }
    }
  })();

  return { accepted: true, ...counts };
}

/**
 * 处理录屏上报：{ appKey, sessionId, userId, timestamp, data: { events, duration, errorCount, errorOffset, ... } }
 */
export function ingestReplay(payload) {
  const appKey = payload?.appKey;
  const data = payload?.data;
  if (!appKey || !data || !Array.isArray(data.events)) {
    return { accepted: false, reason: 'invalid payload' };
  }

  upsertApp.run(appKey, '', payload.timestamp || Date.now());

  insertReplay.run(
    appKey,
    payload.sessionId || '',
    payload.userId || '',
    data.events.length,
    typeof data.duration === 'number' ? Math.round(data.duration) : 0,
    typeof data.errorCount === 'number' ? data.errorCount : 0,
    typeof data.errorOffset === 'number' ? Math.round(data.errorOffset) : -1,
    safeJson(data.events, '[]'),
    payload.timestamp || Date.now()
  );
  return { accepted: true, eventCount: data.events.length };
}
