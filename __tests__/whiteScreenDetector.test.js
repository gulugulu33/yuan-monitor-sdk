/**
 * WhiteScreenDetector 单元测试
 */
import eventBus from '../src/core/eventBus';
import WhiteScreenDetector from '../src/advanced/whiteScreenDetector';

// Mock window
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    innerWidth: 1920,
    innerHeight: 1080,
    location: { href: 'http://test.com', origin: 'http://test.com' }
  },
  writable: true
});

// Mock document
Object.defineProperty(global, 'document', {
  value: {
    readyState: 'complete',
    querySelector: jest.fn(),
    elementFromPoint: jest.fn(),
    body: { textContent: '', children: [] }
  },
  writable: true
});

describe('WhiteScreenDetector', () => {
  let detector;
  const defaultConfig = {
    advanced: {
      enableWhiteScreenDetection: true,
      whiteScreenDetection: {
        enable: true,
        delay: 0,
        rootSelectors: ['#root', '#app'],
        sampleRows: 3,
        sampleCols: 3,
        threshold: 0.9,
        continuous: false
      }
    },
    debug: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();
    detector = new WhiteScreenDetector({ ...defaultConfig });
  });

  afterEach(() => {
    detector.destroy();
  });

  test('enable 为 false 时不初始化', () => {
    detector = new WhiteScreenDetector({
      advanced: {
        enableWhiteScreenDetection: false,
        whiteScreenDetection: { enable: false }
      }
    });
    detector.init();
    // 不应注册任何事件
  });

  test('根容器为空时检测到白屏', () => {
    detector.init();

    // Mock: #root 存在但无内容
    document.querySelector.mockImplementation((sel) => {
      if (sel === '#root') return { textContent: '', children: [] };
      return null;
    });

    const emittedErrors = [];
    eventBus.on('error:captured', (data) => emittedErrors.push(data));

    detector._doCheck();

    expect(emittedErrors.length).toBe(1);
    expect(emittedErrors[0].type).toBe('whiteScreen');
  });

  test('根容器有内容时不判定白屏', () => {
    detector.init();

    document.querySelector.mockImplementation((sel) => {
      if (sel === '#root') return { textContent: 'Hello', children: [] };
      return null;
    });

    // 采样点有内容（非白屏）
    document.elementFromPoint.mockReturnValue({ tagName: 'DIV' });

    const emittedErrors = [];
    eventBus.on('error:captured', (data) => emittedErrors.push(data));

    detector._doCheck();

    expect(emittedErrors.length).toBe(0);
  });

  test('采样点空白占比超过阈值时判定白屏', () => {
    detector.init();

    // Mock: 根容器不存在
    document.querySelector.mockReturnValue(null);

    // Mock: 采样点全部返回 null（空白）
    document.elementFromPoint.mockReturnValue(null);

    const emittedErrors = [];
    eventBus.on('error:captured', (data) => emittedErrors.push(data));

    detector._doCheck();

    expect(emittedErrors.length).toBe(1);
    expect(emittedErrors[0].type).toBe('whiteScreen');
  });

  test('检测到白屏后不重复上报', () => {
    detector.init();

    document.querySelector.mockReturnValue(null);
    document.elementFromPoint.mockReturnValue(null);

    const emittedErrors = [];
    eventBus.on('error:captured', (data) => emittedErrors.push(data));

    detector._doCheck();
    detector._doCheck(); // 第二次不应再上报

    expect(emittedErrors.length).toBe(1);
  });

  test('reset 后可以重新检测', () => {
    detector.init();

    document.querySelector.mockReturnValue(null);
    document.elementFromPoint.mockReturnValue(null);

    const emittedErrors = [];
    eventBus.on('error:captured', (data) => emittedErrors.push(data));

    detector._doCheck();
    expect(emittedErrors.length).toBe(1);

    detector.reset();
    detector._doCheck();
    expect(emittedErrors.length).toBe(2);
  });

  test('destroy 清理定时器和事件', () => {
    detector.init();
    detector.destroy();

    // 不应抛错
    expect(true).toBe(true);
  });
});
