/**
 * ErrorCollector 单元测试
 */
import eventBus from '../src/core/eventBus';
import ErrorCollector from '../src/collector/errorCollector';

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    location: { href: 'http://test.com' },
    onerror: null,
    onunhandledrejection: null
  },
  writable: true
});

// Mock navigator
Object.defineProperty(global, 'navigator', {
  value: { userAgent: 'jest', language: 'zh-CN' },
  writable: true
});

describe('ErrorCollector', () => {
  let collector;
  const defaultConfig = {
    error: {
      enable: true,
      captureGlobalErrors: true,
      capturePromiseRejections: true,
      captureResourceErrors: true
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();
    // 重置 window 错误处理
    window.onerror = null;
    window.onunhandledrejection = null;
    collector = new ErrorCollector({ ...defaultConfig });
  });

  afterEach(() => {
    collector.destroy();
  });

  test('init 时设置全局错误处理和 Promise 拒绝处理', () => {
    collector.init();
    expect(window.onerror).toBeDefined();
    expect(window.onunhandledrejection).toBeDefined();
    expect(window.addEventListener).toHaveBeenCalledWith('error', expect.any(Function), true);
  });

  test('enable 为 false 时不初始化', () => {
    collector = new ErrorCollector({ error: { enable: false } });
    collector.init();
    expect(window.onerror).toBeNull();
  });

  test('全局错误触发 error:captured 事件', () => {
    collector.init();

    const emittedErrors = [];
    eventBus.on('error:captured', (data) => emittedErrors.push(data));

    // 模拟 window.onerror 调用
    window.onerror('Test error message', 'test.js', 10, 5, new Error('Test error'));

    expect(emittedErrors.length).toBe(1);
    expect(emittedErrors[0].type).toBe('js');
    expect(emittedErrors[0].message).toBe('Test error message');
    expect(emittedErrors[0].source).toBe('test.js');
    expect(emittedErrors[0].lineno).toBe(10);
    expect(emittedErrors[0].colno).toBe(5);
  });

  test('Promise 拒绝触发 error:captured 事件', () => {
    collector.init();

    const emittedErrors = [];
    eventBus.on('error:captured', (data) => emittedErrors.push(data));

    // 模拟 onunhandledrejection 调用（不实际创建 Promise.reject 避免未处理拒绝）
    const reason = new Error('Promise rejected');
    window.onunhandledrejection({ reason });

    expect(emittedErrors.length).toBe(1);
    expect(emittedErrors[0].type).toBe('promise');
    expect(emittedErrors[0].message).toBe('Promise rejected');
  });

  test('Script error 被过滤不上报', () => {
    collector.init();

    const emittedErrors = [];
    eventBus.on('error:captured', (data) => emittedErrors.push(data));

    window.onerror('Script error', 'http://other.com/script.js', 1, 1, null);

    expect(emittedErrors.length).toBe(0);
  });

  test('destroy 时恢复原始错误处理函数', () => {
    const originalOnerror = () => {};
    const originalOnunhandledrejection = () => {};
    window.onerror = originalOnerror;
    window.onunhandledrejection = originalOnunhandledrejection;

    collector.init();
    expect(window.onerror).not.toBe(originalOnerror);

    collector.destroy();
    expect(window.onerror).toBe(originalOnerror);
    expect(window.onunhandledrejection).toBe(originalOnunhandledrejection);
  });

  test('handleError 添加 url 和 userAgent', () => {
    collector.init();

    const emittedErrors = [];
    eventBus.on('error:captured', (data) => emittedErrors.push(data));

    collector.handleError({ type: 'custom', message: 'test' });

    expect(emittedErrors.length).toBe(1);
    expect(emittedErrors[0].url).toBe('http://test.com');
    expect(emittedErrors[0].userAgent).toBe('jest');
  });
});
