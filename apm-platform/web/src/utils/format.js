// ---------- 时间格式化 ----------

export function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(Number(ts));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatShortTime(ts) {
  if (!ts) return '-';
  const d = new Date(Number(ts));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromNow(ts) {
  if (!ts) return '-';
  const diff = Date.now() - Number(ts);
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
  return `${Math.floor(diff / 86400e3)} 天前`;
}

// ---------- 数值格式化 ----------

export function formatMs(value) {
  if (value === null || value === undefined) return '-';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------- Web Vitals 评级 ----------
// 阈值参考 web-vitals 官方标准

const VITALS_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FCP: { good: 1800, poor: 3000 },
  CLS: { good: 0.1, poor: 0.25 },
  FID: { good: 100, poor: 300 },
  TTFB: { good: 800, poor: 1800 }
};

export function vitalRating(name, value) {
  if (value === null || value === undefined) return 'unknown';
  const t = VITALS_THRESHOLDS[name];
  if (!t) return 'unknown';
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

export function formatVital(name, value) {
  if (value === null || value === undefined) return '-';
  if (name === 'CLS') return value.toFixed(3);
  return formatMs(value);
}

// ---------- UA 解析（轻量实现，仅提取关键信息） ----------

export function parseUA(ua = '') {
  let browser = '未知';
  let os = '未知';

  if (/Edg\//.test(ua)) browser = ua.match(/Edg\/([\d.]+)/)?.[1] ? `Edge ${ua.match(/Edg\/([\d.]+)/)[1]}` : 'Edge';
  else if (/Chrome\//.test(ua)) browser = `Chrome ${ua.match(/Chrome\/([\d.]+)/)?.[1] || ''}`.trim();
  else if (/Firefox\//.test(ua)) browser = `Firefox ${ua.match(/Firefox\/([\d.]+)/)?.[1] || ''}`.trim();
  else if (/Safari\//.test(ua)) browser = `Safari ${ua.match(/Version\/([\d.]+)/)?.[1] || ''}`.trim();

  if (/Windows/.test(ua)) os = `Windows ${ua.match(/Windows NT ([\d.]+)/)?.[1] === '10.0' ? '10/11' : ''}`.trim();
  else if (/Mac OS X/.test(ua)) os = `macOS ${ua.match(/Mac OS X ([\d_.]+)/)?.[1]?.replace(/_/g, '.') || ''}`.trim();
  else if (/Android/.test(ua)) os = `Android ${ua.match(/Android ([\d.]+)/)?.[1] || ''}`.trim();
  else if (/iPhone|iPad/.test(ua)) os = `iOS ${ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, '.') || ''}`.trim();
  else if (/Linux/.test(ua)) os = 'Linux';

  return { browser, os };
}

// ---------- 错误类型展示 ----------

export const ERROR_TYPE_LABELS = {
  js_error: 'JS 错误',
  runtime: 'JS 错误',
  promise: 'Promise 异常',
  promise_rejection: 'Promise 异常',
  resource: '资源错误',
  resource_error: '资源错误',
  vue: 'Vue 错误',
  vue_error: 'Vue 错误',
  react: 'React 错误',
  manual: '手动上报',
  white_screen: '白屏'
};

export const ERROR_TYPE_TAGS = {
  js_error: 'danger',
  runtime: 'danger',
  promise: 'warning',
  promise_rejection: 'warning',
  resource: 'info',
  resource_error: 'info',
  vue: 'danger',
  vue_error: 'danger',
  react: 'danger',
  manual: '',
  white_screen: 'danger'
};

export function errorTypeLabel(type) {
  return ERROR_TYPE_LABELS[type] || type || '未知';
}

export function errorTypeTag(type) {
  return ERROR_TYPE_TAGS[type] || 'info';
}

// ---------- 面包屑展示 ----------

export const BREADCRUMB_LABELS = {
  click: '点击',
  route: '路由跳转',
  xhr: 'XHR 请求',
  fetch: 'Fetch 请求',
  console: '控制台',
  error: '错误',
  custom: '自定义'
};

export function breadcrumbLabel(crumb) {
  return BREADCRUMB_LABELS[crumb?.type] || crumb?.type || '行为';
}

export function breadcrumbDetail(crumb) {
  if (!crumb) return '';
  const d = crumb.data || crumb;
  if (crumb.type === 'click') {
    const text = d.tagName ? `<${d.tagName.toLowerCase()}>` : '';
    const content = d.textContent || d.text || d.id || '';
    return `${text}${content ? ` "${String(content).slice(0, 40)}"` : ''} ${d.url || d.x ? `(${d.x ?? ''},${d.y ?? ''})` : ''}`.trim();
  }
  if (crumb.type === 'route') return `${d.from || ''} → ${d.to || d.url || ''}`;
  if (crumb.type === 'xhr' || crumb.type === 'fetch') {
    return `${d.method || 'GET'} ${d.url || ''} ${d.status ? `[${d.status}]` : ''}`;
  }
  if (crumb.type === 'console') return `[${d.level || 'log'}] ${String(d.content ?? d.text ?? '').slice(0, 80)}`;
  if (crumb.type === 'error') return d.message || '';
  return JSON.stringify(d).slice(0, 100);
}
