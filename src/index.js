import MonitorCore from './core';
import ErrorCollector from './collector/errorCollector';
import PerformanceCollector from './collector/performanceCollector';
import BehaviorCollector from './collector/behaviorCollector';
import DataReporter from './reporter/dataReporter';
import VueIntegration from './framework/vueIntegration';
import ReactIntegration from './framework/reactIntegration';
import SessionReplay from './advanced/sessionReplay';
import WhiteScreenDetector from './advanced/whiteScreenDetector';
import SourceMapParser from './advanced/sourceMapParser';
import eventBus from './core/eventBus';

class YuanMonitor {
  constructor(options = {}) {
    // 初始化核心配置
    this.core = new MonitorCore(options);
    this.config = this.core.config;

    // 初始化各个模块
    this.errorCollector = new ErrorCollector(this.config);
    this.performanceCollector = new PerformanceCollector(this.config);
    this.behaviorCollector = new BehaviorCollector(this.config);
    this.dataReporter = new DataReporter(this.config);
    this.vueIntegration = new VueIntegration(this.config);
    this.reactIntegration = new ReactIntegration(this.config);
    this.sessionReplay = new SessionReplay(this.config);
    this.whiteScreenDetector = new WhiteScreenDetector(this.config);
    this.sourceMapParser = new SourceMapParser(this.config);

    // 设置事件总线监听器
    this.setupEventListeners();
  }

  setupEventListeners() {
    // 核心初始化完成后，初始化其他模块
    eventBus.on('core:initialized', () => {
      this.errorCollector.init();
      this.performanceCollector.init();
      this.behaviorCollector.init();
      this.dataReporter.init();
      this.reactIntegration.init();
      this.sessionReplay.init();
      this.whiteScreenDetector.init();
      this.sourceMapParser.init();

      // 初始化完成后暴露 React ErrorBoundary 组件
      this.ErrorBoundary = this.reactIntegration.getErrorBoundary();
    });

    // 提供获取会话ID的接口（同步返回）
    eventBus.on('core:getSessionId', () => {
      return this.core.getSessionId();
    });

    // 提供获取用户ID的接口（同步返回）
    eventBus.on('core:getUserId', () => {
      return this.core.userId;
    });

    // 提供获取用户数据的接口（同步返回）
    eventBus.on('core:getUserData', () => {
      return this.core.userData;
    });
  }

  // 初始化SDK
  init() {
    this.core.init();
    return this;
  }

  // 设置配置
  setConfig(options) {
    this.core.setConfig(options);
    this.config = this.core.config;

    // 更新各个模块的配置
    this.errorCollector.config = this.config;
    this.performanceCollector.config = this.config;
    this.behaviorCollector.config = this.config;
    this.dataReporter.config = this.config;
    this.vueIntegration.config = this.config;
    this.reactIntegration.config = this.config;
    this.sessionReplay.config = this.config;
    this.whiteScreenDetector.config = this.config;
    this.sourceMapParser.config = this.config;

    return this;
  }

  // 设置用户ID
  setUserId(userId) {
    this.core.setUserId(userId);
    return this;
  }

  // 设置用户数据
  setUserData(data) {
    this.core.setUserData(data);
    return this;
  }

  // 获取配置
  getConfig() {
    return this.core.getConfig();
  }

  // 获取会话ID
  getSessionId() {
    return this.core.getSessionId();
  }

  // 获取用户行为面包屑
  getBreadcrumbs() {
    return this.behaviorCollector.getBreadcrumbs();
  }

  // 手动上报错误
  reportError(error, context = {}) {
    const errorData = {
      type: 'manual',
      message: error?.message || String(error),
      stack: error?.stack,
      error,
      context
    };

    eventBus.emit('error:captured', errorData);
    return this;
  }

  // 手动上报性能数据
  reportPerformance(data) {
    eventBus.emit('performance:custom', data);
    return this;
  }

  // 手动添加用户行为面包屑
  addBreadcrumb(type, data) {
    this.behaviorCollector.addBreadcrumb(type, data);
    return this;
  }

  // 清空用户行为面包屑
  clearBreadcrumbs() {
    this.behaviorCollector.clearBreadcrumbs();
    return this;
  }

  // 立即上报队列中的数据
  flush() {
    this.dataReporter.flush();
    return this;
  }

  // 销毁SDK
  destroy() {
    this.errorCollector.destroy();
    this.performanceCollector.destroy();
    this.behaviorCollector.destroy();
    this.dataReporter.destroy();
    this.sessionReplay.destroy();
    this.whiteScreenDetector.destroy();
    this.sourceMapParser.destroy();
    this.core.destroy();

    eventBus.clear();
    return this;
  }

  // Vue 插件安装方法（支持 Vue 2 和 Vue 3）
  useVue(Vue, options = {}) {
    this.vueIntegration.install(Vue, options);
    return this;
  }

  // React 包装应用组件
  wrapReactApp(AppComponent) {
    return this.reactIntegration.wrapApp(AppComponent);
  }

  /**
   * 主动设置 React 引用（推荐在 React 项目中使用）
   * 解决 ESM 环境下 require('react') 失败的问题
   *
   * 用法：
   *   import React from 'react';
   *   const monitor = init({ ... });
   *   monitor.setReact(React);
   *   const { ErrorBoundary } = monitor;
   */
  setReact(React) {
    this.reactIntegration.setReact(React);
    this.ErrorBoundary = this.reactIntegration.getErrorBoundary();
    return this;
  }
}

// 导出单例
let instance = null;

const init = (options = {}) => {
  if (!instance) {
    instance = new YuanMonitor(options);
    instance.init();
  } else if (Object.keys(options).length > 0) {
    instance.setConfig(options);
  }
  return instance;
};

// 导出SDK
export {
  YuanMonitor,
  init,
};

export default {
  YuanMonitor,
  init
};
