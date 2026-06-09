/**
 * BehaviorCollector 单元测试
 */
import eventBus from '../src/core/eventBus';
import BehaviorCollector from '../src/collector/behaviorCollector';

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    location: { href: 'http://test.com', origin: 'http://test.com' },
    fetch: jest.fn(() => Promise.resolve({ status: 200 }))
  },
  writable: true
});

// Mock document
Object.defineProperty(global, 'document', {
  value: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    location: { href: 'http://test.com' }
  },
  writable: true
});

// Mock history
Object.defineProperty(global, 'history', {
  value: {
    pushState: jest.fn(),
    replaceState: jest.fn()
  },
  writable: true
});

// Mock XMLHttpRequest
const mockXHROpen = jest.fn();
const mockXHRSend = jest.fn();
global.XMLHttpRequest = jest.fn(() => ({
  open: mockXHROpen,
  send: mockXHRSend,
  addEventListener: jest.fn(),
  _monitor: null,
  status: 200
}));
XMLHttpRequest.prototype = {
  open: mockXHROpen,
  send: mockXHRSend
};

describe('BehaviorCollector', () => {
  let collector;
  const defaultConfig = {
    behavior: {
      enable: true,
      captureClicks: false,
      captureRouteChanges: false,
      captureNetworkRequests: false,
      captureConsole: false,
      maxBreadcrumbs: 20
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();
    collector = new BehaviorCollector({ ...defaultConfig });
  });

  afterEach(() => {
    collector.destroy();
  });

  test('init 时注册面包屑查询接口', () => {
    collector.init();

    const breadcrumbs = eventBus.emit('behavior:getBreadcrumbs');
    expect(breadcrumbs).toEqual([]);
  });

  test('enable 为 false 时不初始化', () => {
    collector = new BehaviorCollector({
      behavior: { enable: false, maxBreadcrumbs: 20 }
    });
    collector.init();

    // 不应注册查询接口
    const result = eventBus.emit('behavior:getBreadcrumbs');
    expect(result).toBeUndefined();
  });

  test('addBreadcrumb 添加面包屑并通过 EventBus 查询', () => {
    collector.init();

    collector.addBreadcrumb('click', { dom: '<button>Test</button>' });
    collector.addBreadcrumb('route', { from: '/home', to: '/about' });

    const breadcrumbs = eventBus.emit('behavior:getBreadcrumbs');
    expect(breadcrumbs.length).toBe(2);
    expect(breadcrumbs[0].type).toBe('click');
    expect(breadcrumbs[1].type).toBe('route');
  });

  test('addBreadcrumb 触发 behavior:breadcrumb 事件', () => {
    collector.init();

    const emittedBreadcrumbs = [];
    eventBus.on('behavior:breadcrumb', (data) => emittedBreadcrumbs.push(data));

    collector.addBreadcrumb('custom', { message: 'test' });

    expect(emittedBreadcrumbs.length).toBe(1);
    expect(emittedBreadcrumbs[0].type).toBe('custom');
  });

  test('面包屑数量超过 maxBreadcrumbs 时移除最早的', () => {
    collector = new BehaviorCollector({
      behavior: { ...defaultConfig.behavior, maxBreadcrumbs: 3 }
    });
    collector.init();

    collector.addBreadcrumb('type1', { index: 1 });
    collector.addBreadcrumb('type2', { index: 2 });
    collector.addBreadcrumb('type3', { index: 3 });
    collector.addBreadcrumb('type4', { index: 4 });

    const breadcrumbs = eventBus.emit('behavior:getBreadcrumbs');
    expect(breadcrumbs.length).toBe(3);
    expect(breadcrumbs[0].index).toBe(2); // 最早的被移除
  });

  test('clearBreadcrumbs 清空面包屑', () => {
    collector.init();

    collector.addBreadcrumb('click', { dom: '<button>' });
    collector.clearBreadcrumbs();

    const breadcrumbs = eventBus.emit('behavior:getBreadcrumbs');
    expect(breadcrumbs).toEqual([]);
  });

  test('destroy 时移除 EventBus 监听', () => {
    collector.init();
    collector.addBreadcrumb('click', { dom: '<button>' });

    collector.destroy();

    // destroy 后查询接口应不可用
    const result = eventBus.emit('behavior:getBreadcrumbs');
    expect(result).toBeUndefined();
  });

  test('getBreadcrumbs 返回副本而非引用', () => {
    collector.init();

    collector.addBreadcrumb('click', { dom: '<button>' });

    const breadcrumbs1 = collector.getBreadcrumbs();
    const breadcrumbs2 = collector.getBreadcrumbs();

    expect(breadcrumbs1).toEqual(breadcrumbs2);
    expect(breadcrumbs1).not.toBe(breadcrumbs2); // 不同引用
  });
});
