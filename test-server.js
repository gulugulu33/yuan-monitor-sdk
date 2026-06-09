const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({
  origin: ['http://localhost:5175', 'http://localhost:5174', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json({ limit: '100mb' }));

// 存储接收到的数据
const receivedData = {
  errors: [],
  performance: [],
  behavior: [],
  sessionReplay: []
};

// 错误/性能/行为上报端点
app.post('/api/report', (req, res) => {
  const data = req.body;
  const items = Array.isArray(data.data) ? data.data : [data.data || data];

  items.forEach(item => {
    if (!item) return;

    const type = item.type || data.type || 'unknown';
    console.log(`\n=== 收到数据 [${type}] ===`);
    console.log('  时间:', new Date(data.timestamp || Date.now()).toLocaleString());
    console.log('  AppKey:', data.appKey || 'N/A');
    console.log('  SessionID:', data.sessionId || 'N/A');
    console.log('  UserID:', data.userId || 'N/A');

    if (type === 'error') {
      console.log('  错误类型:', item.subType || (item.errorData && item.errorData.type));
      console.log('  错误消息:', item.errorData ? item.errorData.message : item.message);
      if (item.errorData && item.errorData.stack) console.log('  堆栈:', item.errorData.stack.substring(0, 200));
      else if (item.stack) console.log('  堆栈:', item.stack.substring(0, 200));
      if (item.breadcrumbs && item.breadcrumbs.length > 0) {
        console.log('  面包屑数:', item.breadcrumbs.length);
      }
      receivedData.errors.push({ timestamp: data.timestamp, type, data: item });
    } else if (type === 'performance') {
      console.log('  性能类型:', item.subType || item.name);
      console.log('  值:', item.value || item.duration || 'N/A');
      receivedData.performance.push({ timestamp: data.timestamp, type, data: item });
    } else if (type === 'behavior') {
      console.log('  行为类型:', item.subType);
      receivedData.behavior.push({ timestamp: data.timestamp, type, data: item });
    }
  });

  res.json({ success: true, message: '数据已接收' });
});

// Session Replay 上报端点
app.post('/api/session-replay', (req, res) => {
  const data = req.body;
  const replayData = data.data || {};

  console.log('\n=== 收到 Session Replay 数据 ===');
  console.log('  时间:', new Date(data.timestamp || Date.now()).toLocaleString());
  console.log('  AppKey:', data.appKey || 'N/A');
  console.log('  SessionID:', data.sessionId || 'N/A');
  console.log('  事件数量:', replayData.events?.length || 0);
  console.log('  录制时长:', replayData.duration ? `${(replayData.duration / 1000).toFixed(1)}s` : 'N/A');
  console.log('  错误数量:', replayData.errorCount || 0);
  console.log('  错误偏移:', replayData.errorOffset >= 0 ? replayData.errorOffset : 'N/A');
  console.log('  最近错误时间:', replayData.lastErrorTime ? new Date(replayData.lastErrorTime).toLocaleString() : 'N/A');

  receivedData.sessionReplay.push({
    timestamp: data.timestamp,
    sessionId: data.sessionId,
    eventsCount: replayData.events?.length || 0,
    duration: replayData.duration,
    errorCount: replayData.errorCount
  });

  res.json({ success: true, message: 'Session replay 数据已接收' });
});

// 获取所有接收到的数据
app.get('/api/data', (req, res) => {
  res.json({
    ...receivedData,
    summary: {
      errors: receivedData.errors.length,
      performance: receivedData.performance.length,
      behavior: receivedData.behavior.length,
      sessionReplay: receivedData.sessionReplay.length
    }
  });
});

// 清空数据
app.delete('/api/clear', (req, res) => {
  receivedData.errors.length = 0;
  receivedData.performance.length = 0;
  receivedData.behavior.length = 0;
  receivedData.sessionReplay.length = 0;
  res.json({ success: true, message: '数据已清空' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log('\n===========================================');
  console.log('  监控服务器已启动！');
  console.log(`  地址: http://localhost:${PORT}`);
  console.log('===========================================');
  console.log('\n可用端点:');
  console.log(`  POST /api/report         - 接收错误和性能数据`);
  console.log(`  POST /api/session-replay - 接收录屏数据`);
  console.log(`  GET  /api/data           - 获取所有接收的数据`);
  console.log(`  DELETE /api/clear        - 清空所有数据`);
  console.log('');
});
