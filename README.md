# Yuan Monitor SDK + APM Platform

前端监控全家桶：一套可独立发布的前端监控 **SDK**，加一个开箱即用的 **APM 可视化平台**（Express + SQLite 后端 / Vue 3 控制台），覆盖「采集 → 上报 → 聚合存储 → 分析回放」完整链路。

```
业务应用 (React / Vue)
    │  引入 yuan-monitor-sdk
    ▼
上报接口 /api/report、/api/session-replay
(Fetch / sendBeacon / Image GIF 自动降级)
    │
    ▼
apm-platform/server ──► SQLite（错误指纹聚合 / 性能 / 行为 / 录屏）
    │  查询统计 API
    ▼
apm-platform/web（Vue 3 控制台：总览 / 错误 / 性能 / 会话回放）
```

## 仓库结构

```
├── src/                  # 监控 SDK 源码（可构建发布为 npm 包）
├── test-react-app/       # SDK 联调测试应用（端口 5175）
├── test-server.js        # SDK 联调用简易接收端（端口 3001）
└── apm-platform/         # APM 平台
    ├── server/           # Express + better-sqlite3（端口 3100）
    │   ├── src/routes/       # 上报接口 + 查询统计 API
    │   ├── src/services/     # 错误指纹聚合、数据清洗入库
    │   ├── src/db/           # 建库脚本 + 访问层（WAL 模式）
    │   └── scripts/seed.js   # 演示种子数据
    └── web/              # Vue 3 + Vite + Element Plus + ECharts（端口 8080）
        └── src/views/        # Dashboard / ErrorList / ErrorDetail / Performance / Replay
```

## 快速启动 APM 平台

```bash
# 1. 后端（端口 3100）
cd apm-platform/server
npm install
npm run seed     # 可选：灌入演示数据
npm start

# 2. 前端控制台（端口 8080）
cd apm-platform/web
npm install
npm run dev
```

打开 **http://localhost:8080** 即可看到平台（seed 数据含一个模拟电商应用 `demo-shop`：4 个聚合后的错误 Issue、Web Vitals、慢资源、长任务与一条可播放的会话录屏）。

## SDK 接入

### React

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { init } from 'yuan-monitor-sdk';

const monitor = init({
  appKey: 'your-app-key',
  serverUrl: 'http://localhost:3100/api/report',
  framework: { react: true },
  advanced: { enableSessionReplay: true, sessionReplaySampleRate: 1 }
});

const { ErrorBoundary } = monitor;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
```

### Vue

```javascript
import { createApp } from 'vue';
import App from './App.vue';
import { init } from 'yuan-monitor-sdk';

const monitor = init({
  appKey: 'your-app-key',
  serverUrl: 'http://localhost:3100/api/report',
  framework: { vue: true }
});

createApp(App).use(monitor).mount('#app');
```

SDK 上报的应用会按 `appKey` 自动注册到 APM 平台，无需手工配置。

## SDK 功能特性

### 错误监控
- JavaScript 运行时错误 / Promise 拒绝 / 资源加载错误捕获
- Vue errorHandler、React ErrorBoundary 框架集成
- Source Map 堆栈解析支持

### 性能监控
- Web Vitals（LCP / FID / CLS / FCP / TTFB）
- 资源加载耗时、长任务（LongTask 归因）、内存使用跟踪
- 自定义性能指标

### 用户行为
- 点击、路由变化、网络请求（XHR/Fetch）、控制台日志
- 面包屑轨迹，随错误事件关联上报

### 会话录屏
- 基于 rrweb 的页面操作录制
- 输入框隐私脱敏、敏感元素屏蔽
- 错误发生时刻定位，支持一键跳转回放

### 上报策略
- Fetch / sendBeacon / Image GIF 三通道自动降级
- 批量合并、可配置间隔、失败重试（指数退避）
- 采样率控制、调试模式

## APM 平台功能

| 模块 | 能力 |
|------|------|
| 总览 Dashboard | 错误/用户数趋势、Web Vitals P75、Top Issues |
| 错误分析 | 指纹聚合为 Issue（消息归一化 + 堆栈特征帧）、趋势与页面/用户分布、事件明细（堆栈、面包屑时间线、UA/环境）、状态流转（解决/忽略/重开） |
| 性能分析 | 5 项 Web Vitals P50/P75/P95 与评级分布（Google 阈值）、时间分桶趋势、页面性能排行、慢资源列表、长任务归因脚本定位 |
| 会话回放 | rrweb 播放器：进度拖拽、倍速、错误时刻标记与一键跳转；错误详情直连关联录屏 |

## API 一览

平台后端（端口 3100）：

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/report` | SDK 数据上报（fetch/beacon/image 均兼容） |
| GET | `/api/report?data=...` | Image GIF 兜底上报通道 |
| POST | `/api/session-replay` | 录屏数据上报 |
| GET | `/api/apps` | 应用列表 |
| GET | `/api/stats/overview` | 总览统计 |
| GET | `/api/errors`、`/api/errors/:id` | Issue 列表 / 详情 |
| GET | `/api/errors/:id/events` | 错误事件明细分页 |
| PATCH | `/api/errors/:id/status` | Issue 状态流转 |
| GET | `/api/stats/performance` | Web Vitals 统计与趋势 |
| GET | `/api/performance/resources` | 慢资源列表 |
| GET | `/api/performance/long-tasks` | 长任务列表 |
| GET | `/api/replays`、`/api/replays/:id` | 会话列表 / 录屏数据 |
| GET | `/api/sessions/:sessionId/replay` | 按会话 ID 获取录屏（错误详情跳转回放用） |

## SDK 本地联调

```bash
# 终端 1：构建 SDK
npm run build

# 终端 2：联调接收端（端口 3001，仅打印/暂存上报数据）
node test-server.js

# 终端 3：测试应用（端口 5175）
cd test-react-app
npm run dev
```

访问 **http://localhost:5175**，通过测试页按钮触发各类错误、长任务、录屏；**http://localhost:3001/api/data** 查看原始上报数据。

## 隐私保护

```javascript
const config = {
  advanced: {
    enableSessionReplay: true,
    maskAllInputs: true,
    blockSelector: '.private-info, [data-private]',
    ignoreClass: 'no-monitor',
    maskTextSelector: 'input[type="password"]'
  }
};
```

- 录屏默认对密码输入框脱敏，支持按选择器屏蔽/忽略元素
- SDK 不收集敏感个人信息，数据传输建议走 HTTPS

## 浏览器支持

- Chrome（推荐）/ Firefox / Safari / Edge
- IE 11 有限支持

## License

MIT
