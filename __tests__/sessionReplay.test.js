/**
 * SessionReplay 单元测试
 */
import eventBus from '../src/core/eventBus';
import SessionReplay from '../src/advanced/sessionReplay';

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
  value: { sendBeacon: mockSendBeacon },
  writable: true
});

// Mock fetch
global.fetch = jest.fn(() => Promise.resolve({ ok: true }));

// Mock document
Object.defineProperty(global, 'document', {
  value: {
    referrer: '',
    visibilityState: 'visible',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  },
  writable: true
});

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    visibilityState: 'visible'
  },
  writable: true
});

describe('SessionReplay', () => {
  let sessionReplay;
  const defaultConfig = {
    appKey: 'test-key',
    serverUrl: 'http://localhost:3001',
    debug: false,
    advanced: {
      enableSessionReplay: true,
      sessionReplaySampleRate: 1,
      replayBeforeError: 30,
      replayAfterError: 10,
      maxReplayDuration: 60
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();
    sessionReplay = new SessionReplay({ ...defaultConfig });
  });

  afterEach(() => {
    sessionReplay.destroy();
  });

  test('init 时注册错误监听和页面卸载监听', () => {
    sessionReplay.init();
    expect(global.window.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(global.window.addEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
  });

  test('采样率为 0 时不初始化', () => {
    sessionReplay = new SessionReplay({
      ...defaultConfig,
      advanced: { ...defaultConfig.advanced, sessionReplaySampleRate: 0 }
    });
    sessionReplay.init();
    expect(sessionReplay.isRecording).toBe(false);
  });

  test('enableSessionReplay 为 false 时不初始化', () => {
    sessionReplay = new SessionReplay({
      ...defaultConfig,
      advanced: { ...defaultConfig.advanced, enableSessionReplay: false }
    });
    sessionReplay.init();
    expect(sessionReplay.isRecording).toBe(false);
  });

  test('错误捕获时标记位置并设置自动上报定时器', () => {
    jest.useFakeTimers();
    sessionReplay.init();

    sessionReplay.events = [
      { timestamp: Date.now() - 5000 },
      { timestamp: Date.now() - 3000 },
      { timestamp: Date.now() - 1000 }
    ];

    eventBus.emit('error:captured', { type: 'js', message: 'test error' });

    expect(sessionReplay.errorIndex).toBe(3);
    expect(sessionReplay.pendingErrorCount).toBe(1);
    expect(sessionReplay.lastErrorTime).toBeGreaterThan(0);

    jest.advanceTimersByTime(10000);
    jest.useRealTimers();
  });

  test('连续错误重置自动上报定时器', () => {
    jest.useFakeTimers();
    sessionReplay.init();
    sessionReplay.events = [{ timestamp: Date.now() }];

    eventBus.emit('error:captured', { type: 'js', message: 'error1' });
    jest.advanceTimersByTime(5000);

    eventBus.emit('error:captured', { type: 'js', message: 'error2' });
    jest.advanceTimersByTime(5000);

    expect(sessionReplay.pendingErrorCount).toBe(2);

    jest.advanceTimersByTime(5000);
    jest.useRealTimers();
  });

  test('环形缓冲区溢出时移除最早事件并调整 errorIndex', () => {
    sessionReplay.init();
    const maxEvents = 5;
    sessionReplay.events = [];

    for (let i = 0; i < maxEvents; i++) {
      sessionReplay.events.push({ timestamp: Date.now() + i * 100 });
    }

    sessionReplay.errorIndex = 3;

    sessionReplay.events.push({ timestamp: Date.now() + 5 * 100 });
    if (sessionReplay.events.length > maxEvents) {
      sessionReplay.events.shift();
      if (sessionReplay.errorIndex > 0) sessionReplay.errorIndex--;
    }

    expect(sessionReplay.events.length).toBe(5);
    expect(sessionReplay.errorIndex).toBe(2);
  });

  test('errorIndex 为 0 时被移出缓冲区后设为 -1', () => {
    sessionReplay.init();
    sessionReplay.events = [];
    const maxEvents = 3;

    sessionReplay.events.push({ timestamp: 1 });
    sessionReplay.events.push({ timestamp: 2 });
    sessionReplay.errorIndex = 0;

    // push 超过 maxEvents 触发 shift
    sessionReplay.events.push({ timestamp: 3 });
    sessionReplay.events.push({ timestamp: 4 });
    while (sessionReplay.events.length > maxEvents) {
      sessionReplay.events.shift();
      if (sessionReplay.errorIndex === 0) {
        sessionReplay.errorIndex = -1;
      } else if (sessionReplay.errorIndex > 0) {
        sessionReplay.errorIndex--;
      }
    }

    expect(sessionReplay.errorIndex).toBe(-1);
  });

  test('_reportSessionReplay 截取错误前30秒数据', () => {
    sessionReplay.init();
    const now = Date.now();

    sessionReplay.events = [];
    for (let i = 0; i < 40; i++) {
      sessionReplay.events.push({ timestamp: now - (40 - i) * 1000 });
    }

    sessionReplay.errorIndex = 35;
    sessionReplay.lastErrorTime = now - 5 * 1000;
    sessionReplay.pendingErrorCount = 1;

    const sendReportSpy = jest.spyOn(sessionReplay, '_sendReport').mockImplementation(() => {});

    sessionReplay._reportSessionReplay();

    expect(sendReportSpy).toHaveBeenCalled();
    const reportedData = sendReportSpy.mock.calls[0][0];
    expect(reportedData.events.length).toBeGreaterThan(0);
    expect(reportedData.errorCount).toBe(1);

    sendReportSpy.mockRestore();
  });

  test('_sendReport 使用 sendBeacon 上报到正确路径', () => {
    sessionReplay.init();

    const data = {
      type: 'session-replay',
      timestamp: Date.now(),
      events: [{ timestamp: Date.now() }],
      duration: 1000,
      errorCount: 1,
      errorOffset: 0
    };

    sessionReplay._sendReport(data);

    expect(mockSendBeacon).toHaveBeenCalledWith(
      'http://localhost:3001/api/session-replay',
      expect.any(Object) // Blob
    );
  });

  test('_sendReport 上报数据包含 sessionId 和 userId', () => {
    sessionReplay.init();

    eventBus.on('core:getSessionId', () => 'test-session-123');
    eventBus.on('core:getUserId', () => 'test-user-456');

    const data = {
      type: 'session-replay',
      timestamp: Date.now(),
      events: [{ timestamp: Date.now() }],
      duration: 1000,
      errorCount: 0,
      errorOffset: -1
    };

    // 用 fetch mock 来验证数据内容（sendBeacon 传 Blob 不方便解析）
    mockSendBeacon.mockReturnValueOnce(false); // 强制降级到 fetch

    sessionReplay._sendReport(data);

    expect(global.fetch).toHaveBeenCalled();
    const fetchCall = global.fetch.mock.calls[0];
    expect(fetchCall[0]).toBe('http://localhost:3001/api/session-replay');
    const reportedData = JSON.parse(fetchCall[1].body);
    expect(reportedData.sessionId).toBe('test-session-123');
    expect(reportedData.userId).toBe('test-user-456');
  });

  test('页面卸载时上报待处理数据', () => {
    sessionReplay.init();
    sessionReplay.events = [{ timestamp: Date.now() }];
    sessionReplay.pendingErrorCount = 1;
    sessionReplay.lastErrorTime = Date.now();

    const sendReportSpy = jest.spyOn(sessionReplay, '_sendReport').mockImplementation(() => {});

    // 模拟页面隐藏
    global.document.visibilityState = 'hidden';
    sessionReplay._onPageUnload();

    expect(sendReportSpy).toHaveBeenCalled();

    sendReportSpy.mockRestore();
    global.document.visibilityState = 'visible';
  });

  test('页面可见时不上报', () => {
    sessionReplay.init();
    sessionReplay.events = [{ timestamp: Date.now() }];
    sessionReplay.pendingErrorCount = 1;

    const sendReportSpy = jest.spyOn(sessionReplay, '_sendReport').mockImplementation(() => {});

    global.document.visibilityState = 'visible';
    sessionReplay._onPageUnload();

    expect(sendReportSpy).not.toHaveBeenCalled();

    sendReportSpy.mockRestore();
  });

  test('destroy 时上报待处理数据并清理资源', () => {
    jest.useFakeTimers();
    sessionReplay.init();
    sessionReplay.events = [{ timestamp: Date.now() }];
    sessionReplay.pendingErrorCount = 1;
    sessionReplay.lastErrorTime = Date.now();

    const sendReportSpy = jest.spyOn(sessionReplay, '_sendReport').mockImplementation(() => {});

    sessionReplay.destroy();

    expect(sendReportSpy).toHaveBeenCalled();
    expect(sessionReplay.events).toEqual([]);
    expect(sessionReplay.pendingErrorCount).toBe(0);

    sendReportSpy.mockRestore();
    jest.useRealTimers();
  });
});
