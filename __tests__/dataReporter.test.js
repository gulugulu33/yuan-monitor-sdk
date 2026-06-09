/**
 * DataReporter 单元测试
 */
import eventBus from '../src/core/eventBus';
import DataReporter from '../src/reporter/dataReporter';

// Mock fetch
global.fetch = jest.fn(() => Promise.resolve({ ok: true }));

// Mock navigator
const mockSendBeacon = jest.fn(() => true);
Object.defineProperty(global, 'navigator', {
  value: { sendBeacon: mockSendBeacon, userAgent: 'jest', language: 'zh-CN' },
  writable: true
});

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    visibilityState: 'visible',
    location: { href: 'http://test.com' },
    innerWidth: 1920,
    innerHeight: 1080,
    screen: { width: 1920, height: 1080 },
    get fetch() { return global.fetch; }
  },
  writable: true
});

// Mock document
Object.defineProperty(global, 'document', {
  value: { referrer: '', visibilityState: 'visible' },
  writable: true
});

// Mock Intl
global.Intl = {
  DateTimeFormat: jest.fn(() => ({
    resolvedOptions: () => ({ timeZone: 'Asia/Shanghai' })
  }))
};

describe('DataReporter', () => {
  let reporter;
  const defaultConfig = {
    appKey: 'test-key',
    serverUrl: 'http://localhost:3001',
    debug: false,
    behavior: { enable: true },
    reporter: {
      batchSize: 5,
      batchInterval: 5000,
      maxQueueSize: 20,
      reportMethod: 'fetch',
      retryCount: 3,
      retryDelay: 1000
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();
    reporter = new DataReporter({ ...defaultConfig });
  });

  afterEach(() => {
    reporter.destroy();
  });

  test('init 时注册事件监听和页面卸载监听', () => {
    reporter.init();
    expect(global.window.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(global.window.addEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
  });

  test('错误上报时携带面包屑', () => {
    reporter.init();

    // 注册面包屑查询接口
    const breadcrumbs = [{ type: 'click', timestamp: Date.now() }];
    eventBus.on('behavior:getBreadcrumbs', () => breadcrumbs);

    // 注册核心数据接口
    eventBus.on('core:getSessionId', () => 'session-123');
    eventBus.on('core:getUserId', () => 'user-456');
    eventBus.on('core:getUserData', () => ({}));

    // 触发错误
    eventBus.emit('error:captured', {
      type: 'js',
      message: 'test error',
      stack: 'Error: test'
    });

    // 队列中应有数据
    expect(reporter.queue.length).toBeGreaterThanOrEqual(1);
    // 找到错误类型的数据
    const errorItem = reporter.queue.find(item => item.type === 'error');
    expect(errorItem).toBeDefined();
    expect(errorItem.breadcrumbs).toEqual(breadcrumbs);
    expect(errorItem.errorData.message).toBe('test error');
  });

  test('队列达到 batchSize 时立即上报', () => {
    reporter.init();
    eventBus.on('core:getSessionId', () => 'session-123');
    eventBus.on('core:getUserId', () => '');
    eventBus.on('core:getUserData', () => ({}));

    for (let i = 0; i < 5; i++) {
      reporter.addToQueue({ type: 'test', index: i });
    }

    expect(global.fetch).toHaveBeenCalled();
  });

  test('fetch 上报使用正确的 URL 和 keepalive', () => {
    reporter.init();
    eventBus.on('core:getSessionId', () => 'session-123');
    eventBus.on('core:getUserId', () => '');
    eventBus.on('core:getUserData', () => ({}));

    reporter.addToQueue({ type: 'test' });
    reporter.flush();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/report',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        keepalive: true
      })
    );
  });

  test('destroy 时上报剩余数据', () => {
    reporter.init();
    eventBus.on('core:getSessionId', () => 'session-123');
    eventBus.on('core:getUserId', () => '');
    eventBus.on('core:getUserData', () => ({}));

    reporter.addToQueue({ type: 'test' });
    reporter.destroy();

    expect(global.fetch).toHaveBeenCalled();
  });

  test('页面卸载时上报剩余数据', () => {
    reporter.init();
    eventBus.on('core:getSessionId', () => 'session-123');
    eventBus.on('core:getUserId', () => '');
    eventBus.on('core:getUserData', () => ({}));

    reporter.addToQueue({ type: 'test' });

    // 模拟页面隐藏
    global.document.visibilityState = 'hidden';
    reporter._onPageUnload();

    expect(global.fetch).toHaveBeenCalled();
    global.document.visibilityState = 'visible';
  });

  test('sessionId 通过 EventBus 正确获取', () => {
    reporter.init();
    eventBus.on('core:getSessionId', () => 'my-session-id');
    eventBus.on('core:getUserId', () => '');
    eventBus.on('core:getUserData', () => ({}));

    reporter.addToQueue({ type: 'test' });
    reporter.flush();

    const callArgs = global.fetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.sessionId).toBe('my-session-id');
  });

  test('取消订阅使用保存的引用，destroy 后不再接收事件', () => {
    reporter.init();

    // destroy 后不再监听
    reporter.destroy();

    eventBus.on('core:getSessionId', () => '');
    eventBus.on('core:getUserId', () => '');
    eventBus.on('core:getUserData', () => ({}));

    // 触发错误，不应入队
    eventBus.emit('error:captured', { type: 'js', message: 'after destroy' });

    expect(reporter.queue.length).toBe(0);
  });
});
