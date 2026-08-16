import express from 'express';
import cors from 'cors';
import reportRoutes from './routes/report.js';
import queryRoutes from './routes/queries.js';

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

app.get('/health', (req, res) => res.json({ success: true, uptime: process.uptime() }));

app.use('/api', reportRoutes);
app.use('/api', queryRoutes);

// 统一错误兜底，避免进程退出
app.use((err, req, res, next) => {
  console.error('[APM Server] 请求处理出错:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`[APM Server] running at http://localhost:${PORT}`);
});
