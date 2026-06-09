/**
 * SourceMapParser 单元测试
 */
import eventBus from '../src/core/eventBus';
import SourceMapParser from '../src/advanced/sourceMapParser';

describe('SourceMapParser', () => {
  let parser;
  const defaultConfig = {
    advanced: {
      sourceMap: {
        enable: true,
        mapUrlTemplate: '',
        serverParseUrl: '',
        cache: true,
        maxCacheSize: 50,
        maxStackDepth: 10
      }
    },
    debug: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();
    parser = new SourceMapParser({ ...defaultConfig });
  });

  afterEach(() => {
    parser.destroy();
  });

  test('enable 为 false 时不初始化', () => {
    parser = new SourceMapParser({
      advanced: { sourceMap: { enable: false } }
    });
    parser.init();
    // 不应注册事件监听
  });

  test('_parseStackFrames 正确解析标准堆栈', () => {
    parser.init();

    const stack = `Error: test error
    at handleClick (http://example.com/app.js:10:5)
    at onClick (http://example.com/main.js:25:12)
    at render (http://example.com/index.js:3:1)`;

    const frames = parser._parseStackFrames(stack);

    expect(frames.length).toBe(3);
    expect(frames[0].functionName).toBe('handleClick');
    expect(frames[0].filePath).toBe('http://example.com/app.js');
    expect(frames[0].line).toBe(10);
    expect(frames[0].column).toBe(5);
  });

  test('_parseStackFrames 过滤 chrome-extension 和 node_modules', () => {
    parser.init();

    const stack = `Error: test
    at handleClick (http://example.com/app.js:10:5)
    at chrome-extension://abc/script.js:1:1
    at onClick (http://example.com/node_modules/lib/index.js:5:3)`;

    const frames = parser._parseStackFrames(stack);

    expect(frames.length).toBe(1);
    expect(frames[0].filePath).toBe('http://example.com/app.js');
  });

  test('_parseStackFrames 限制最大深度', () => {
    parser = new SourceMapParser({
      ...defaultConfig,
      advanced: {
        sourceMap: { ...defaultConfig.advanced.sourceMap, maxStackDepth: 2 }
      }
    });
    parser.init();

    const stack = `Error: test
    at fn1 (http://example.com/a.js:1:1)
    at fn2 (http://example.com/b.js:2:2)
    at fn3 (http://example.com/c.js:3:3)`;

    const frames = parser._parseStackFrames(stack);
    expect(frames.length).toBe(2);
  });

  test('_parseStackFrames 处理匿名函数', () => {
    parser.init();

    const stack = `Error: test
    at http://example.com/app.js:10:5`;

    const frames = parser._parseStackFrames(stack);
    expect(frames.length).toBe(1);
    expect(frames[0].functionName).toBe('<anonymous>');
  });

  test('_getSourceMapUrl 使用模板', () => {
    parser = new SourceMapParser({
      ...defaultConfig,
      advanced: {
        sourceMap: {
          ...defaultConfig.advanced.sourceMap,
          mapUrlTemplate: 'https://cdn.example.com/maps/{file}.map'
        }
      }
    });
    parser.init();

    const url = parser._getSourceMapUrl('app.js');
    expect(url).toBe('https://cdn.example.com/maps/app.js.map');
  });

  test('_getSourceMapUrl 默认追加 .map', () => {
    parser.init();

    const url = parser._getSourceMapUrl('http://example.com/app.js');
    expect(url).toBe('http://example.com/app.js.map');
  });

  test('destroy 清理缓存和事件', () => {
    parser.init();
    parser._cache.set('test', { destroy: jest.fn() });

    parser.destroy();

    expect(parser._cache.size).toBe(0);
    expect(parser._errorHandler).toBeNull();
  });

  test('无堆栈的错误不触发解析', () => {
    parser.init();

    const emittedEvents = [];
    eventBus.on('advanced:sourceMap:parsed', (data) => emittedEvents.push(data));

    // 无 stack 的错误
    parser._onErrorCaptured({ type: 'js', message: 'test' });

    expect(emittedEvents.length).toBe(0);
  });
});
