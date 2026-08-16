import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

const RANGE_MS = { '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3 };
const DEFAULT_ISSUE_STATUS = ['unresolved', 'resolved', 'ignored'];

function parseRange(range) {
  const ms = RANGE_MS[range];
  const end = Date.now();
  return { start: ms ? end - ms : end - RANGE_MS['24h'], end };
}

function bucketSizeFor(range) {
  if (range === '1h') return 5 * 60e3;      // 5 分钟一桶
  if (range === '7d') return 24 * 3600e3;   // 1 天一桶
  return 3600e3;                            // 24h → 1 小时一桶
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  const idx = Math.min(sortedValues.length - 1, Math.floor(p * (sortedValues.length - 1)));
  return sortedValues[idx];
}

// ---------- 项目 ----------

router.get('/apps', (req, res) => {
  const apps = db.prepare(`SELECT app_key, name, created_at FROM apps ORDER BY created_at DESC`).all();
  const count24h = db.prepare(
    `SELECT app_key, COUNT(*) AS c FROM error_events WHERE timestamp >= ? GROUP BY app_key`
  ).all(Date.now() - RANGE_MS['24h']);
  const map = new Map(count24h.map(r => [r.app_key, r.c]));
  res.json({
    success: true,
    data: apps.map(a => ({ ...a, errorCount24h: map.get(a.app_key) || 0 }))
  });
});

// ---------- 总览统计 ----------

router.get('/stats/overview', (req, res) => {
  const { appKey, range = '24h' } = req.query;
  if (!appKey) return res.status(400).json({ success: false, message: '缺少 appKey' });
  const { start, end } = parseRange(range);
  const bucket = bucketSizeFor(range);

  const errorCount = db.prepare(
    `SELECT COUNT(*) AS c FROM error_events WHERE app_key = ? AND timestamp >= ? AND timestamp <= ?`
  ).get(appKey, start, end).c;

  const issueCount = db.prepare(
    `SELECT COUNT(*) AS c FROM error_issues WHERE app_key = ? AND last_seen >= ?`
  ).get(appKey, start).c;

  const unresolvedCount = db.prepare(
    `SELECT COUNT(*) AS c FROM error_issues WHERE app_key = ? AND last_seen >= ? AND status = 'unresolved'`
  ).get(appKey, start).c;

  const affectedUsers = db.prepare(
    `SELECT COUNT(DISTINCT user_id) AS c FROM error_events WHERE app_key = ? AND timestamp >= ? AND timestamp <= ? AND user_id != ''`
  ).get(appKey, start, end).c;

  const trend = db.prepare(
    `SELECT CAST(timestamp / ? AS INTEGER) * ? AS t, COUNT(*) AS c
     FROM error_events
     WHERE app_key = ? AND timestamp >= ? AND timestamp <= ?
     GROUP BY t ORDER BY t`
  ).all(bucket, bucket, appKey, start, end).map(r => ({ time: r.t, count: r.c }));

  const topIssues = db.prepare(
    `SELECT id, type, message, status, count, first_seen, last_seen
     FROM error_issues
     WHERE app_key = ? AND last_seen >= ?
     ORDER BY count DESC LIMIT 6`
  ).all(appKey, start);

  // Web Vitals 分位数统计（web-vitals 值数量 = 页面浏览量级，JS 内存计算分位数足够）
  const vitals = {};
  for (const name of ['LCP', 'FCP', 'CLS', 'FID', 'TTFB']) {
    const rows = db.prepare(
      `SELECT value FROM performance_events
       WHERE app_key = ? AND sub_type = 'web-vital' AND name = ? AND timestamp >= ? AND timestamp <= ?`
    ).all(appKey, name, start, end).map(r => r.value).filter(v => typeof v === 'number').sort((a, b) => a - b);
    vitals[name] = {
      count: rows.length,
      avg: rows.length ? rows.reduce((s, v) => s + v, 0) / rows.length : null,
      p75: percentile(rows, 0.75)
    };
  }

  res.json({
    success: true,
    data: { range, errorCount, issueCount, unresolvedCount, affectedUsers, trend, topIssues, vitals }
  });
});

// ---------- 错误 Issue 列表 ----------

router.get('/errors', (req, res) => {
  const {
    appKey, page = 1, pageSize = 20,
    type, status, keyword, sort = 'recent', range = '7d'
  } = req.query;
  if (!appKey) return res.status(400).json({ success: false, message: '缺少 appKey' });

  const { start } = parseRange(range);
  const conditions = ['i.app_key = ?', 'i.last_seen >= ?'];
  const params = [appKey, start];

  if (type) { conditions.push('i.type = ?'); params.push(type); }
  if (status && DEFAULT_ISSUE_STATUS.includes(status)) { conditions.push('i.status = ?'); params.push(status); }
  if (keyword) {
    conditions.push('(i.message LIKE ? OR i.stack LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const orderBy = sort === 'count' ? 'i.count DESC, i.last_seen DESC' : 'i.last_seen DESC';
  const limit = Math.min(Number(pageSize) || 20, 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const total = db.prepare(`SELECT COUNT(*) AS c FROM error_issues i ${where}`).get(...params).c;

  const rows = db.prepare(
    `SELECT i.id, i.type, i.message, i.status, i.count, i.first_seen, i.last_seen,
       (SELECT COUNT(DISTINCT e.user_id) FROM error_events e
         WHERE e.issue_id = i.id AND e.user_id != '') AS affected_users
     FROM error_issues i ${where}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ success: true, data: { total, page: Number(page) || 1, pageSize: limit, items: rows } });
});

// 修改 issue 状态（已解决 / 忽略 / 重新打开）
router.patch('/errors/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!DEFAULT_ISSUE_STATUS.includes(status)) {
    return res.status(400).json({ success: false, message: '非法状态' });
  }
  const info = db.prepare(`UPDATE error_issues SET status = ? WHERE id = ?`).run(status, req.params.id);
  if (info.changes === 0) return res.status(404).json({ success: false, message: 'issue 不存在' });
  res.json({ success: true });
});

// ---------- 错误 Issue 详情 ----------

router.get('/errors/:id', (req, res) => {
  const issue = db.prepare(`SELECT * FROM error_issues WHERE id = ?`).get(req.params.id);
  if (!issue) return res.status(404).json({ success: false, message: 'issue 不存在' });

  const { start } = parseRange('7d');
  const bucket = bucketSizeFor('24h');

  const trend = db.prepare(
    `SELECT CAST(timestamp / ? AS INTEGER) * ? AS t, COUNT(*) AS c
     FROM error_events WHERE issue_id = ? AND timestamp >= ?
     GROUP BY t ORDER BY t`
  ).all(bucket, bucket, issue.id, start).map(r => ({ time: r.t, count: r.c }));

  const pageDist = db.prepare(
    `SELECT page_url, COUNT(*) AS c FROM error_events
     WHERE issue_id = ? AND page_url != '' GROUP BY page_url ORDER BY c DESC LIMIT 10`
  ).all(issue.id);

  const userDist = db.prepare(
    `SELECT user_id, COUNT(*) AS c FROM error_events
     WHERE issue_id = ? AND user_id != '' GROUP BY user_id ORDER BY c DESC LIMIT 10`
  ).all(issue.id);

  res.json({ success: true, data: { ...issue, trend, pageDist, userDist } });
});

// ---------- 错误事件列表（含面包屑 / 上下文） ----------

router.get('/errors/:id/events', (req, res) => {
  const { page = 1, pageSize = 10 } = req.query;
  const limit = Math.min(Number(pageSize) || 10, 50);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const total = db.prepare(`SELECT COUNT(*) AS c FROM error_events WHERE issue_id = ?`).get(req.params.id).c;

  const rows = db.prepare(
    `SELECT * FROM error_events WHERE issue_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`
  ).all(req.params.id, limit, offset);

  const items = rows.map(r => ({
    ...r,
    breadcrumbs: JSON.parse(r.breadcrumbs || '[]'),
    context: JSON.parse(r.context || '{}'),
    extra: JSON.parse(r.extra || '{}')
  }));

  res.json({ success: true, data: { total, page: Number(page) || 1, pageSize: limit, items } });
});

// ---------- 会话录屏 ----------

router.get('/replays', (req, res) => {
  const { appKey, sessionId, page = 1, pageSize = 15 } = req.query;
  if (!appKey) return res.status(400).json({ success: false, message: '缺少 appKey' });

  const conditions = ['app_key = ?'];
  const params = [appKey];
  if (sessionId) { conditions.push('session_id = ?'); params.push(sessionId); }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const limit = Math.min(Number(pageSize) || 15, 50);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

  const total = db.prepare(`SELECT COUNT(*) AS c FROM session_replays ${where}`).get(...params).c;
  const rows = db.prepare(
    `SELECT id, app_key, session_id, user_id, event_count, duration, error_count, error_offset, created_at
     FROM session_replays ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  res.json({ success: true, data: { total, page: Number(page) || 1, pageSize: limit, items: rows } });
});

router.get('/replays/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM session_replays WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: '录屏不存在' });
  res.json({ success: true, data: { ...row, events: JSON.parse(row.events || '[]') } });
});

// 按 sessionId 获取最近一条录屏（错误详情页跳转用）
router.get('/sessions/:sessionId/replay', (req, res) => {
  const { appKey } = req.query;
  if (!appKey) return res.status(400).json({ success: false, message: '缺少 appKey' });
  const row = db.prepare(
    `SELECT id, app_key, session_id, user_id, event_count, duration, error_count, error_offset, created_at
     FROM session_replays WHERE app_key = ? AND session_id = ?
     ORDER BY created_at DESC LIMIT 1`
  ).get(appKey, req.params.sessionId);
  res.json({ success: true, data: row || null });
});

// ---------- 性能分析 ----------

const VITAL_NAMES = ['LCP', 'FCP', 'CLS', 'FID', 'TTFB'];
const VITALS_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FCP: { good: 1800, poor: 3000 },
  CLS: { good: 0.1, poor: 0.25 },
  FID: { good: 100, poor: 300 },
  TTFB: { good: 800, poor: 1800 }
};

// 分页 SQL 的公共参数
function pageParams(req, defSize = 15, maxSize = 50) {
  const limit = Math.min(Number(req.query.pageSize) || defSize, maxSize);
  const page = Math.max(Number(req.query.page) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
}

// 性能总览：各指标分位数/评级分布、按时间桶的 p75 趋势、页面维度聚合
router.get('/stats/performance', (req, res) => {
  const { appKey, range = '24h' } = req.query;
  if (!appKey) return res.status(400).json({ success: false, message: '缺少 appKey' });
  const { start, end } = parseRange(range);
  const bucket = bucketSizeFor(range);

  const vitals = {};
  const trend = {};
  // 页面维度：page_url → { LCP: [], FCP: [], CLS: [] }
  const pageMap = {};

  for (const name of VITAL_NAMES) {
    const rows = db.prepare(
      `SELECT value, timestamp, page_url FROM performance_events
       WHERE app_key = ? AND sub_type = 'web-vital' AND name = ? AND timestamp >= ? AND timestamp <= ?
       ORDER BY timestamp DESC LIMIT 50000`
    ).all(appKey, name, start, end).filter(r => typeof r.value === 'number');

    const values = rows.map(r => r.value).sort((a, b) => a - b);
    const th = VITALS_THRESHOLDS[name];
    const rating = { good: 0, poor: 0, 'needs-improvement': 0 };
    for (const v of values) {
      if (v <= th.good) rating.good++;
      else if (v <= th.poor) rating['needs-improvement']++;
      else rating.poor++;
    }

    vitals[name] = {
      count: values.length,
      avg: values.length ? values.reduce((s, v) => s + v, 0) / values.length : null,
      p50: percentile(values, 0.5),
      p75: percentile(values, 0.75),
      p95: percentile(values, 0.95),
      rating
    };

    // 按桶聚合，计算桶级 p75
    const byBucket = new Map();
    for (const r of rows) {
      const t = Math.floor(r.timestamp / bucket) * bucket;
      if (!byBucket.has(t)) byBucket.set(t, []);
      byBucket.get(t).push(r.value);
      // 页面维度（仅取主要指标，避免重复统计）
      if (name === 'LCP' || name === 'FCP' || name === 'CLS') {
        const url = r.page_url || '(未知页面)';
        if (!pageMap[url]) pageMap[url] = { LCP: [], FCP: [], CLS: [] };
        pageMap[url][name].push(r.value);
      }
    }
    trend[name] = [...byBucket.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, vs]) => {
        const sorted = [...vs].sort((a, b) => a - b);
        return { time: t, p75: percentile(sorted, 0.75), count: vs.length };
      });
  }

  // 页面性能表：按 LCP p75 降序取 top 10
  const pages = Object.entries(pageMap)
    .map(([url, m]) => ({
      page_url: url,
      count: m.LCP.length,
      lcp75: percentile([...m.LCP].sort((a, b) => a - b), 0.75),
      fcp75: percentile([...m.FCP].sort((a, b) => a - b), 0.75),
      cls75: percentile([...m.CLS].sort((a, b) => a - b), 0.75)
    }))
    .sort((a, b) => (b.lcp75 ?? -1) - (a.lcp75 ?? -1))
    .slice(0, 10);

  // 内存概览（仅 Chrome 上报）
  const mem = db.prepare(
    `SELECT AVG(value) AS avgUsed, MAX(value) AS maxUsed, COUNT(*) AS c
     FROM performance_events
     WHERE app_key = ? AND sub_type = 'memory' AND name = 'usedJSHeapSize' AND timestamp >= ? AND timestamp <= ?`
  ).get(appKey, start, end);

  res.json({ success: true, data: { range, vitals, trend, pages, memory: mem } });
});

// 慢资源列表
router.get('/performance/resources', (req, res) => {
  const { appKey, range = '24h', keyword, initiatorType, sort = 'duration' } = req.query;
  if (!appKey) return res.status(400).json({ success: false, message: '缺少 appKey' });
  const { start } = parseRange(range);
  const { limit, offset, page } = pageParams(req, 15, 50);

  const conditions = [`app_key = ?`, `sub_type = 'resource'`, `timestamp >= ?`];
  const params = [appKey, start];
  if (keyword) { conditions.push('name LIKE ?'); params.push(`%${keyword}%`); }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM performance_events ${where}`).get(...params).c;
  const orderBy = sort === 'recent' ? 'timestamp DESC' : 'value DESC';

  const rows = db.prepare(
    `SELECT id, name, value AS duration, page_url, timestamp, detail
     FROM performance_events ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  const items = rows.map(r => {
    const detail = JSON.parse(r.detail || '{}');
    if (initiatorType && detail.initiatorType !== initiatorType) return null;
    return {
      id: r.id,
      name: r.name,
      duration: r.duration,
      page_url: r.page_url,
      timestamp: r.timestamp,
      initiatorType: detail.initiatorType || '-',
      transferSize: detail.transferSize,
      protocol: detail.nextHopProtocol || '-',
      isCache: !!detail.isCache
    };
  }).filter(Boolean);

  res.json({ success: true, data: { total, page, pageSize: limit, items } });
});

// 长任务列表
router.get('/performance/long-tasks', (req, res) => {
  const { appKey, range = '24h', minDuration = 50 } = req.query;
  if (!appKey) return res.status(400).json({ success: false, message: '缺少 appKey' });
  const { start } = parseRange(range);
  const { limit, offset, page } = pageParams(req, 15, 50);

  const min = Math.max(Number(minDuration) || 50, 0);
  const total = db.prepare(
    `SELECT COUNT(*) AS c FROM performance_events
     WHERE app_key = ? AND sub_type = 'long-task' AND value >= ? AND timestamp >= ?`
  ).get(appKey, min, start).c;

  const rows = db.prepare(
    `SELECT id, value AS duration, page_url, timestamp, detail
     FROM performance_events
     WHERE app_key = ? AND sub_type = 'long-task' AND value >= ? AND timestamp >= ?
     ORDER BY value DESC LIMIT ? OFFSET ?`
  ).all(appKey, min, start, limit, offset);

  const items = rows.map(r => {
    const detail = JSON.parse(r.detail || '{}');
    const attr = Array.isArray(detail.attribution) ? detail.attribution[0] : null;
    return {
      id: r.id,
      duration: r.duration,
      startTime: detail.startTime,
      page_url: r.page_url,
      timestamp: r.timestamp,
      containerType: attr?.containerType || attr?.containerName || '-',
      scriptUrl: attr?.scriptUrl ? attr.scriptUrl.split('/').pop() : '-'
    };
  });

  res.json({ success: true, data: { total, page, pageSize: limit, items } });
});

export default router;
