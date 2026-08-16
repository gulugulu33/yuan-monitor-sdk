import crypto from 'node:crypto';

/**
 * 归一化错误消息：把数字、十六进制、UUID、引号内容等易变部分替换为占位符，
 * 保证"同类错误不同参数"能聚合到同一个 issue。
 */
export function normalizeMessage(message) {
  if (!message) return '';
  return String(message)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/(['"])(?:(?!\1).){0,80}\1/g, '<str>')
    .replace(/\d+(\.\d+)?/g, '<n>')
    .trim();
}

/**
 * 提取堆栈中最有区分度的一帧（首个带 URL 的 at 行），
 * 取「函数名@文件名」作为指纹组成部分，忽略行列号（代码变更前行号会浮动）。
 */
export function topFrame(stack) {
  if (!stack) return '';
  for (const line of String(stack).split('\n')) {
    const m = line.match(/at\s+(?:(async)\s+)?(.+?)\s+\(?(https?:\/\/[^)\s]+|file:\/\/[^)\s]+)\)?/);
    if (!m) continue;
    const func = (m[1] ? `${m[1]} ` : '') + (m[2] || '<anonymous>');
    const file = m[3]
      .replace(/[?#].*$/, '')
      .split('/')
      .pop()
      .replace(/:\d+(:\d+)?$/, ''); // 去掉行列号，避免代码未变但行列浮动导致指纹分裂
    return `${func}@${file}`;
  }
  return '';
}

function basenameOf(url) {
  if (!url) return '';
  try {
    const u = new URL(url, 'http://_');
    return u.pathname.split('/').pop() || u.href;
  } catch {
    return String(url).split('?')[0].split('/').pop() || '';
  }
}

/**
 * 计算错误指纹：subType + 归一化消息 + 堆栈特征帧（兜底用资源文件名）。
 * 同一代码位置产生的同类错误聚合为同一 issue。
 */
export function computeFingerprint(item) {
  const err = item.errorData || {};
  const subType = item.subType || err.type || 'unknown';
  const message = err.message || item.message || '';
  const frame = topFrame(err.stack) || basenameOf(err.source || err.url || '');
  return crypto
    .createHash('md5')
    .update(`${subType}|${normalizeMessage(message)}|${frame}`)
    .digest('hex');
}
