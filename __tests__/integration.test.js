/**
 * 集成测试：验证 SDK 完整流程
 * EventBus + SessionReplay + DataReporter + BehaviorCollector 协作
 */
import eventBus from '../src/core/eventBus';
import SessionReplay from '../src/advanced/sessionReplay';
import DataReporter from '../src/reporter/dataReporter';
import BehaviorCollector from '../src/collector/behaviorCollector';

// Mock rrweb
jest.mock('rrweb', () => ({
  record: jest.fn((options) => {
    global.__rrwebEmit = options.emit;
    return jest.fn();
  })
}), { virtual: true });

// Mock navigator
const mockSendBeacon = jest.fn(() => true);
Object.defineProperty(global, 'navigator', {
  value: { sendBeacon: mockSendBeacon, userAgent: 'jest', language: 'zh-CN' },
  writable: true
});

global.fetch = jest.fn(() => Promise.resolve({ ok: true }));

Object.defineProperty(global, 'window', {
  value: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    visibilityState: 'visible',
    location: { href: 'http://test.com', origin: 'http://test.com' },
    innerWidth: 1920,
    innerHeight: 1080,
    screen: { width: 1920, height: 1080 },
    get fetch() { return global.fetch; }
  },
  writable: true
});

Object.defineProperty(global, 'document', {
  value: { referrer: '', location: { href: 'http://test.com' }, visibilityState: 'visible' },
  writable: true
});

global.Intl = {
  DateTimeFormat: jest.fn(() => ({
    resolvedOptions: () => ({ timeZone: 'UTC' })
  }))
};

describe('集成测试：SDK 完整流程', () => {
  const config = {
    appKey: 'integration-test',
    serverUrl: 'http://localhost:3001',
    debug: false,
    behavior: {
      enable: true,
      captureClicks: false,
      captureRouteChanges: false,
      captureNetworkRequests: false,
      captureConsole: false,
      maxBreadcrumbs: 20
    },
    reporter: {
      batchSize: 100,  // 设置大一点，避免自动 flush
      batchInterval: 60000,
      maxQueueSize: 100,
      reportMethod: 'fetch',
      retryCount: 3,
      retryDelay: 1000
    },
    advanced: {
      enableSessionReplay: true,
      sessionReplaySampleRate: 1,
      replayBeforeError: 30,
      replayAfterError: 10,
      maxReplayDuration: 60
    }
  };

  let behaviorCollector;
  let dataReporter;
  let sessionReplay;

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();

    behaviorCollector = new BehaviorCollector({ ...config });
    dataReporter = new DataReporter({ ...config });
    sessionReplay = new SessionReplay({ ...config });
  });

  afterEach(() => {
    sessionReplay.destroy();
    dataReporter.destroy();
    behaviorCollector.destroy();
  });

  test('错误触发时，DataReporter 获取面包屑，SessionReplay 标记位置', () => {
    behaviorCollector.init();
    dataReporter.init();
    sessionReplay.init();

    eventBus.on('core:getSessionId', () => 'int-session-001');
    eventBus.on('core:getUserId', () => 'int-user-001');
    eventBus.on('core:getUserData', () => ({ env: 'test' }));

    // 添加面包屑
    behaviorCollector.addBreadcrumb('click', { dom: '<button>Submit</button>' });
    behaviorCollector.addBreadcrumb('route', { from: '/home', to: '/about' });

    // 模拟录屏事件
    sessionReplay.events = [
      { timestamp: Date.now() - 3000 },
      { timestamp: Date.now() - 2000 },
      { timestamp: Date.now() - 1000 }
    ];

    // 触发错误
    eventBus.emit('error:captured', {
      type: 'js',
      message: 'Uncaught TypeError',
      stack: 'TypeError: Cannot read property'
    });

    // 验证 SessionReplay 标记了错误位置
    expect(sessionReplay.errorIndex).toBeGreaterThanOrEqual(0);
    expect(sessionReplay.pendingErrorCount).toBe(1);

    // 验证 DataReporter 队列中有错误数据
    const errorItem = dataReporter.queue.find(item => item.type === 'error');
    expect(errorItem).toBeDefined();
    expect(errorItem.errorData.type).toBe('js');
    expect(errorItem.breadcrumbs.length).toBe(2);
  });

  test('EventBus 同步返回值在模块间正确传递', () => {
    behaviorCollector.init();

    const breadcrumbs = eventBus.emit('behavior:getBreadcrumbs');
    expect(breadcrumbs).toEqual([]);

    behaviorCollector.addBreadcrumb('click', { dom: '<div>' });
    const updatedBreadcrumbs = eventBus.emit('behavior:getBreadcrumbs');
    expect(updatedBreadcrumbs.length).toBe(1);
    expect(updatedBreadcrumbs[0].type).toBe('click');
  });

  test('SessionReplay 上报数据包含正确的 sessionId', () => {
    sessionReplay.init();

    eventBus.on('core:getSessionId', () => 'session-abc');
    eventBus.on('core:getUserId', () => 'user-xyz');

    sessionReplay.events = [{ timestamp: Date.now() }];
    sessionReplay.pendingErrorCount = 1;
    sessionReplay.lastErrorTime = Date.now();

    sessionReplay._reportSessionReplay();

    expect(mockSendBeacon).toHaveBeenCalled();
    const callArgs = mockSendBeacon.mock.calls[0];
    expect(callArgs[0]).toBe('http://localhost:3001/api/session-replay');
  });

  test('完整流程：面包屑 → 错误 → DataReporter 上报 → SessionReplay 上报', () => {
    jest.useFakeTimers();

    behaviorCollector.init();
    dataReporter.init();
    sessionReplay.init();

    eventBus.on('core:getSessionId', () => 'full-flow-session');
    eventBus.on('core:getUserId', () => '');
    eventBus.on('core:getUserData', () => ({}));

    // 1. 用户操作产生面包屑
    behaviorCollector.addBreadcrumb('click', { dom: '<button>Login</button>' });

    // 2. 模拟录屏事件
    sessionReplay.events = [
      { timestamp: Date.now() - 2000 },
      { timestamp: Date.now() - 1000 }
    ];

    // 3. 触发错误
    eventBus.emit('error:captured', {
      type: 'js',
      message: 'Network Error',
      stack: 'Error: Network Error'
    });

    // 4. DataReporter 应已收到错误数据（含面包屑）
    const errorItem = dataReporter.queue.find(item => item.type === 'error');
    expect(errorItem).toBeDefined();
    expect(errorItem.breadcrumbs.length).toBe(1);
    expect(errorItem.errorData.message).toBe('Network Error');

    // 5. SessionReplay 应标记了错误位置
    expect(sessionReplay.pendingErrorCount).toBe(1);

    // 6. 等待 replayAfterError 时间后，SessionReplay 上报
    jest.advanceTimersByTime(10000);

    // SessionReplay 应已上报
    expect(mockSendBeacon).toHaveBeenCalled();

    jest.useRealTimers();
  });
});
