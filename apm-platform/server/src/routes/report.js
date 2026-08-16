import { Router } from 'express';
import { ingestReport, ingestReplay } from '../services/ingestion.js';

const router = Router();

// 1x1 透明 GIF，供 image 上报方式使用
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// 兼容 SDK 的 image 上报：GET /api/report?data=<urlencoded json>
function parseQueryPayload(req) {
  const raw = req.query.data;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      return null;
    }
  }
}

// 错误 / 性能 / 行为上报
router.post('/report', (req, res) => {
  const payload = req.body || parseQueryPayload(req);
  if (!payload?.appKey) {
    return res.status(400).json({ success: false, message: '缺少 appKey 或数据格式不正确' });
  }
  const result = ingestReport(payload);
  if (!result.accepted) {
    return res.status(400).json({ success: false, message: result.reason });
  }
  res.json({ success: true, ...result });
});

// image 方式上报走 GET，返回图片
router.get('/report', (req, res) => {
  const payload = parseQueryPayload(req);
  if (payload?.appKey) ingestReport(payload);
  res.set('Content-Type', 'image/gif');
  res.send(PIXEL);
});

// 会话录屏上报
router.post('/session-replay', (req, res) => {
  const result = ingestReplay(req.body);
  if (!result.accepted) {
    return res.status(400).json({ success: false, message: result.reason });
  }
  res.json({ success: true, ...result });
});

export default router;
