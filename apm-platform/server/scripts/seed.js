/**
 * 种子数据脚本：模拟 yuan-monitor-sdk 的真实上报流量，用于本地联调。
 * 前置条件：server 已启动（npm start）。
 * 运行：npm run seed
 */
const SERVER = process.env.APM_SERVER || 'http://localhost:3100';
const APP_KEY = 'demo-shop';

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const now = () => Date.now();

const PAGES = [
  'http://localhost:5174/',
  'http://localhost:5174/products',
  'http://localhost:5174/product/10086',
  'http://localhost:5174/cart',
  'http://localhost:5174/checkout'
];

const UAS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'
];

const env = () => ({
  userAgent: pick(UAS),
  language: 'zh-CN',
  url: pick(PAGES),
  referrer: pick(PAGES),
  screenWidth: 1920,
  screenHeight: 1080,
  viewportWidth: 1280,
  viewportHeight: 800,
  timezone: 'Asia/Shanghai'
});

function breadcrumbs(ts) {
  return [
    { type: 'route', data: { from: '/products', to: '/product/10086' }, timestamp: ts - 25000 },
    { type: 'click', data: { tagName: 'BUTTON', textContent: '加入购物车', x: 640, y: 512 }, timestamp: ts - 18000 },
    { type: 'xhr', data: { method: 'GET', url: '/api/product/10086', status: 200 }, timestamp: ts - 12000 },
    { type: 'click', data: { tagName: 'BUTTON', textContent: '立即购买', x: 640, y: 560 }, timestamp: ts - 6000 },
    { type: 'console', data: { level: 'warn', content: '库存查询接口返回异常数据' }, timestamp: ts - 3000 }
  ];
}

// ---------- 错误数据 ----------

const ERROR_SEEDS = [
  {
    subType: 'js_error',
    weight: 10,
    make: (n) => ({
      type: 'error', subType: 'js_error',
      errorData: {
        type: 'js_error',
        message: `Cannot read properties of undefined (reading 'price')`,
        stack: [
          'TypeError: Cannot read properties of undefined (reading \'price\')',
          `    at renderPrice (http://localhost:5174/assets/index-Bq3xK9.js:412:${18 + n}:15)`,
          '    at VueJS render (http://localhost:5174/assets/vendor.js:1204:33)',
          '    at http://localhost:5174/assets/index-Bq3xK9.js:988:21'
        ].join('\n'),
        source: 'http://localhost:5174/assets/index-Bq3xK9.js',
        lineno: 412, colno: 18 + n
      }
    })
  },
  {
    subType: 'promise',
    weight: 7,
    make: () => ({
      type: 'error', subType: 'promise',
      errorData: {
        type: 'promise',
        message: 'Failed to fetch /api/order/create: 接口超时',
        stack: [
          'TypeError: Failed to fetch',
          '    at createOrder (http://localhost:5174/assets/index-Bq3xK9.js:731:12)',
          '    at async submitCheckout (http://localhost:5174/assets/index-Bq3xK9.js:705:5)'
        ].join('\n'),
        source: 'http://localhost:5174/assets/index-Bq3xK9.js',
        lineno: 731, colno: 12
      }
    })
  },
  {
    subType: 'vue',
    weight: 4,
    make: () => ({
      type: 'error', subType: 'vue',
      errorData: {
        type: 'vue',
        message: 'Error in v-on handler: "TypeError: Cannot read properties of null (accessing \'skuList\')"',
        stack: [
          'TypeError: Cannot read properties of null (accessing \'skuList\')',
          '    at Proxy.loadSkus (http://localhost:5174/assets/index-Bq3xK9.js:566:23)',
          '    at VueJS errorHandler (http://localhost:5174/assets/vendor.js:1102:9)'
        ].join('\n'),
        source: 'http://localhost:5174/assets/index-Bq3xK9.js',
        componentName: 'ProductDetail',
        info: 'render function'
      }
    })
  },
  {
    subType: 'resource',
    weight: 6,
    make: () => ({
      type: 'error', subType: 'resource',
      errorData: {
        type: 'resource',
        message: `Failed to load resource: the server responded with a status of 403 (Forbidden)`,
        tagName: 'IMG',
        source: 'https://cdn.example-shop.com/images/sku-banner.jpg',
        outerHTML: '<img src="https://cdn.example-shop.com/images/sku-banner.jpg" class="banner">'
      }
    })
  }
];

// ---------- 会话录屏（rrweb 1.x 最小事件集） ----------

function buildReplayEvents(t0) {
  const events = [];

  // Meta（type=4）
  events.push({
    type: 4,
    data: { href: 'http://localhost:5174/product/10086', width: 1280, height: 800 },
    timestamp: t0
  });

  // FullSnapshot（type=2）
  events.push({
    type: 2,
    data: {
      node: {
        type: 0, id: 1, childNodes: [
          { type: 2, id: 2, tagName: 'html', attributes: { lang: 'zh-CN' }, childNodes: [
            { type: 2, id: 3, tagName: 'head', attributes: {}, childNodes: [] },
            { type: 2, id: 4, tagName: 'body', attributes: {}, childNodes: [
              { type: 2, id: 5, tagName: 'div', attributes: { class: 'page' }, childNodes: [
                { type: 2, id: 6, tagName: 'h2', attributes: {}, childNodes: [
                  { type: 3, id: 7, textContent: '商品详情页（演示回放）' }
                ] },
                { type: 2, id: 8, tagName: 'input', attributes: { type: 'text', placeholder: '输入数量' }, childNodes: [] },
                { type: 2, id: 9, tagName: 'button', attributes: { class: 'buy-btn' }, childNodes: [
                  { type: 3, id: 10, textContent: '立即购买' }
                ] },
                { type: 2, id: 11, tagName: 'div', attributes: { class: 'price-box' }, childNodes: [
                  { type: 3, id: 12, textContent: '错误将在 20 秒后发生…' }
                ] }
              ]}
            ]}
          ]}
        ]
      }
    },
    timestamp: t0 + 30
  });

  // 鼠标移动（source=1）
  let x = 200, y = 300;
  for (let i = 0; i < 24; i++) {
    x = Math.min(1200, Math.max(60, x + randInt(-90, 120)));
    y = Math.min(740, Math.max(60, y + randInt(-70, 80)));
    events.push({
      type: 3,
      data: { source: 1, positions: [{ x, y, id: 4, timeOffset: 0 }] },
      timestamp: t0 + 800 + i * 900
    });
  }

  // 输入（source=5）
  events.push({ type: 3, data: { source: 5, id: 8, text: '2', isChecked: false }, timestamp: t0 + 9000 });
  events.push({ type: 3, data: { source: 5, id: 8, text: '2 件', isChecked: false }, timestamp: t0 + 10500 });

  // 点击购买按钮（source=2, type=2 click）
  events.push({ type: 3, data: { source: 2, type: 2, id: 9, x: 420, y: 420 }, timestamp: t0 + 18000 });

  // 错误发生时刻 20s：再补一组鼠标抖动
  events.push({ type: 3, data: { source: 1, positions: [{ x: 500, y: 460, id: 4, timeOffset: 0 }] }, timestamp: t0 + 20000 });
  events.push({ type: 3, data: { source: 1, positions: [{ x: 512, y: 468, id: 4, timeOffset: 0 }] }, timestamp: t0 + 21000 });
  events.push({ type: 3, data: { source: 1, positions: [{ x: 480, y: 500, id: 4, timeOffset: 0 }] }, timestamp: t0 + 22000 });
  events.push({ type: 3, data: { source: 1, positions: [{ x: 466, y: 520, id: 4, timeOffset: 0 }] }, timestamp: t0 + 26000 });

  return events;
}

// ---------- 上报 ----------

async function post(path, body) {
  const res = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function reportBatch(items, sessionId, userId) {
  return post('/api/report', {
    appKey: APP_KEY,
    sessionId,
    userId,
    userData: { name: `测试用户${userId}` },
    data: items,
    timestamp: now(),
    environment: env()
  });
}

async function main() {
  console.log(`向 ${SERVER} 写入种子数据（appKey: ${APP_KEY}）...`);

  // 1. 错误事件：过去 24h 内按权重分布
  const totalErrors = 260;
  const weighted = [];
  for (const seed of ERROR_SEEDS) {
    for (let i = 0; i < seed.weight; i++) weighted.push(seed);
  }

  let batch = [];
  for (let i = 0; i < totalErrors; i++) {
    const seed = pick(weighted);
    const ts = now() - randInt(0, 24 * 3600 - 1) * 1000;
    const sessionId = `seed-sess-${String(randInt(1, 60)).padStart(3, '0')}`;
    const userId = `u_${randInt(1000, 1099)}`;

    const item = seed.make(randInt(1, 40));
    item.timestamp = ts;
    item.breadcrumbs = breadcrumbs(ts);

    batch.push(item);
    if (batch.length >= 20) {
      await reportBatch(batch, sessionId, userId);
      batch = [];
    }
  }
  if (batch.length) await reportBatch(batch, `seed-sess-${randInt(1, 60)}`, `u_${randInt(1000, 1099)}`);
  console.log(`已写入 ${totalErrors} 条错误事件`);

  // 2. 性能数据：web-vitals + resource + long-task + memory
  const vitalsSpec = { LCP: [1200, 5200], FCP: [800, 3600], CLS: [0, 0.4], FID: [0, 320], TTFB: [150, 2400] };
  batch = [];
  let pv = 0;
  for (const [name, [min, max]] of Object.entries(vitalsSpec)) {
    for (let i = 0; i < 70; i++) {
      const ts = now() - randInt(0, 24 * 3600 - 1) * 1000;
      const sessionId = `seed-sess-${String(randInt(1, 60)).padStart(3, '0')}`;
      batch.push({
        type: 'performance', subType: 'web-vital', name,
        value: name === 'CLS' ? Number(rand(min, max).toFixed(3)) : Math.round(rand(min, max)),
        delta: 0, id: `vital-${name}-${i}`,
        timestamp: ts,
        __session: sessionId
      });
      pv++;
    }
  }
  // 按 20 条一批上报（附 session）
  for (let i = 0; i < batch.length; i += 20) {
    const chunk = batch.slice(i, i + 20);
    await reportBatch(chunk.map(({ __session, ...item }) => item), chunk[0].__session, `u_${randInt(1000, 1099)}`);
  }
  console.log(`已写入 ${pv} 条 web-vitals`);

  const perfItems = [];
  for (let i = 0; i < 60; i++) {
    perfItems.push({
      type: 'performance', subType: 'resource',
      name: pick(['https://cdn.example-shop.com/js/chunk-3.js', 'https://cdn.example-shop.com/css/main.css', '/api/product/list']),
      initiatorType: pick(['script', 'link', 'xmlhttprequest']),
      duration: Math.round(rand(50, 3500)),
      transferSize: randInt(2000, 500000),
      timestamp: now() - randInt(0, 24 * 3600 - 1) * 1000
    });
  }
  for (let i = 0; i < 25; i++) {
    perfItems.push({
      type: 'performance', subType: 'long-task',
      duration: Math.round(rand(80, 900)),
      startTime: Math.round(rand(0, 8000)),
      attribution: [{
        containerType: pick(['window', 'document', 'div.app', 'section.list']),
        containerName: pick(['', '', 'product-list', 'cart-panel']),
        containerSrc: '',
        scriptUrl: pick([
          'http://localhost:5174/assets/vendor.js',
          'http://localhost:5174/assets/index-Bq3xK9.js',
          'https://cdn.example-shop.com/js/chunk-3.js'
        ])
      }],
      timestamp: now() - randInt(0, 24 * 3600 - 1) * 1000
    });
  }
  for (let i = 0; i < 25; i++) {
    perfItems.push({
      type: 'performance', subType: 'memory',
      jsHeapSizeLimit: 4294705152,
      totalJSHeapSize: randInt(30000000, 90000000),
      usedJSHeapSize: randInt(20000000, 70000000),
      timestamp: now() - randInt(0, 24 * 3600 - 1) * 1000
    });
  }
  for (let i = 0; i < perfItems.length; i += 20) {
    await reportBatch(perfItems.slice(i, i + 20), `seed-sess-${randInt(1, 60)}`, `u_${randInt(1000, 1099)}`);
  }
  console.log(`已写入 ${perfItems.length} 条资源 / 长任务 / 内存数据`);

  // 3. 行为事件
  const behaviorItems = [];
  for (let i = 0; i < 80; i++) {
    const ts = now() - randInt(0, 24 * 3600 - 1) * 1000;
    behaviorItems.push({
      type: 'behavior', subType: pick(['click', 'route', 'xhr']),
      data: { tagName: 'BUTTON', textContent: '查看购物车', url: '/api/cart', method: 'GET', status: 200 },
      timestamp: ts
    });
  }
  for (let i = 0; i < behaviorItems.length; i += 20) {
    await reportBatch(behaviorItems.slice(i, i + 20), `seed-sess-${randInt(1, 60)}`, `u_${randInt(1000, 1099)}`);
  }
  console.log(`已写入 ${behaviorItems.length} 条行为事件`);

  // 4. 会话录屏：与一个错误事件关联（同 session）
  const sessionId = 'seed-sess-042';
  const userId = 'u_1001';
  const t0 = now() - randInt(60000, 3600000);
  const replayEvents = buildReplayEvents(t0);

  // 同 session 补一个错误事件（20s 时刻，与 errorOffset 对齐）
  const errAt = t0 + 20000;
  const errorSeed = ERROR_SEEDS[0];
  const errorItem = errorSeed.make(randInt(1, 40));
  errorItem.timestamp = errAt;
  errorItem.breadcrumbs = breadcrumbs(errAt);
  await reportBatch([errorItem], sessionId, userId);

  await post('/api/session-replay', {
    appKey: APP_KEY,
    sessionId,
    userId,
    timestamp: t0 + 30000,
    data: {
      events: replayEvents,
      duration: 30000,
      errorCount: 1,
      errorOffset: 20000,
      lastErrorTime: errAt
    }
  });
  console.log(`已写入 1 条会话录屏（session: ${sessionId}，错误偏移 20s）`);

  console.log('种子数据写入完成。');
}

main().catch((err) => {
  console.error('种子数据写入失败:', err.message);
  console.error('请确认 server 已启动：cd apm-platform/server && npm start');
  process.exit(1);
});
