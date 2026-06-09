/**
 * VueIntegration 单元测试
 */
import eventBus from '../src/core/eventBus';
import VueIntegration from '../src/framework/vueIntegration';

describe('VueIntegration', () => {
  let integration;
  const defaultConfig = { framework: { vue: true } };

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.clear();
    integration = new VueIntegration({ ...defaultConfig });
  });

  afterEach(() => {
    integration.uninstall();
  });

  test('install 传入 null 不报错', () => {
    expect(() => integration.install(null)).not.toThrow();
  });

  test('Vue 2 集成：设置 errorHandler', () => {
    const Vue2 = {
      version: '2.6.14',
      config: { errorHandler: null },
      mixin: jest.fn()
    };

    integration.install(Vue2);

    expect(Vue2.config.errorHandler).toBeDefined();
    expect(Vue2.mixin).toHaveBeenCalled();
  });

  test('Vue 2 错误捕获触发 error:captured 事件', () => {
    const Vue2 = {
      version: '2.6.14',
      config: { errorHandler: null },
      mixin: jest.fn()
    };

    integration.install(Vue2);

    const emittedErrors = [];
    eventBus.on('error:captured', (data) => emittedErrors.push(data));

    const testError = new Error('Vue 2 test error');
    const testVM = { $options: { name: 'TestComponent' } };
    Vue2.config.errorHandler(testError, testVM, 'render');

    expect(emittedErrors.length).toBe(1);
    expect(emittedErrors[0].type).toBe('vue');
    expect(emittedErrors[0].message).toBe('Vue 2 test error');
    expect(emittedErrors[0].componentName).toBe('TestComponent');
  });

  test('Vue 3 集成：设置 app.config.errorHandler', () => {
    const app3 = {
      config: { errorHandler: null, globalProperties: {} }
    };

    integration.install(app3, { isVue3: true });

    expect(app3.config.errorHandler).toBeDefined();
  });

  test('Vue 3 错误捕获触发 error:captured 事件', () => {
    const app3 = {
      config: { errorHandler: null, globalProperties: {} }
    };

    integration.install(app3, { isVue3: true });

    const emittedErrors = [];
    eventBus.on('error:captured', (data) => emittedErrors.push(data));

    const testError = new Error('Vue 3 test error');
    const testInstance = { $options: { name: 'V3Component' }, type: { name: 'V3Component' } };
    app3.config.errorHandler(testError, testInstance, 'setup');

    expect(emittedErrors.length).toBe(1);
    expect(emittedErrors[0].type).toBe('vue');
    expect(emittedErrors[0].message).toBe('Vue 3 test error');
  });

  test('Vue 2 原始 errorHandler 被保留并调用', () => {
    const originalHandler = jest.fn();
    const Vue2 = {
      version: '2.6.14',
      config: { errorHandler: originalHandler },
      mixin: jest.fn()
    };

    integration.install(Vue2);

    const testError = new Error('test');
    Vue2.config.errorHandler(testError, null, 'test');

    expect(originalHandler).toHaveBeenCalledWith(testError, null, 'test');
  });

  test('uninstall 恢复 Vue 2 原始 errorHandler', () => {
    const originalHandler = jest.fn();
    const Vue2 = {
      version: '2.6.14',
      config: { errorHandler: originalHandler },
      mixin: jest.fn()
    };

    integration.install(Vue2);
    expect(Vue2.config.errorHandler).not.toBe(originalHandler);

    integration.uninstall();
    expect(Vue2.config.errorHandler).toBe(originalHandler);
  });

  test('uninstall 恢复 Vue 3 原始 errorHandler', () => {
    const originalHandler = jest.fn();
    const app3 = {
      config: { errorHandler: originalHandler, globalProperties: {} }
    };

    integration.install(app3, { isVue3: true });
    expect(app3.config.errorHandler).not.toBe(originalHandler);

    integration.uninstall();
    expect(app3.config.errorHandler).toBe(originalHandler);
  });

  test('自动检测 Vue 3（通过 globalProperties）', () => {
    const app3 = {
      config: { errorHandler: null, globalProperties: {} }
    };

    integration.install(app3);

    expect(app3.config.errorHandler).toBeDefined();
  });

  test('自动检测 Vue 2（通过 version）', () => {
    const Vue2 = {
      version: '2.7.0',
      config: { errorHandler: null },
      mixin: jest.fn()
    };

    integration.install(Vue2);

    expect(Vue2.config.errorHandler).toBeDefined();
    expect(Vue2.mixin).toHaveBeenCalled();
  });
});
