import eventBus from '../core/eventBus';

class DataReporter {
  constructor(config) {
    this.config = config;
    this.queue = [];
    this.timer = null;
    this.retryCount = {};
    this._boundHandlers = {};  // 保存绑定后的回调引用，用于正确取消订阅
    this._unloadHandler = null;
  }

  init() {
    // 保存绑定后的回调引用，确保 off 时能正确匹配
    this._boundHandlers = {
      errorCaptured: this._reportError.bind(this),
      webVital: this._reportPerformance.bind(this),
      resource: this._reportPerformance.bind(this),
      longTask: this._reportPerformance.bind(this),
      memory: this._reportPerformance.bind(this),
      breadcrumb: this._reportBehavior.bind(this)
    };

    eventBus.on('error:captured', this._boundHandlers.errorCaptured);
    eventBus.on('performance:web-vital', this._boundHandlers.webVital);
    eventBus.on('performance:resource', this._boundHandlers.resource);
    eventBus.on('performance:long-task', this._boundHandlers.longTask);
    eventBus.on('performance:memory', this._boundHandlers.memory);
    eventBus.on('behavior:breadcrumb', this._boundHandlers.breadcrumb);

    // 页面卸载时上报剩余数据
    this._unloadHandler = () => this._onPageUnload();
    window.addEventListener('visibilitychange', this._unloadHandler);
    window.addEventListener('pagehide', this._unloadHandler);

    eventBus.emit('reporter:initialized');
  }

  /**
   * 页面卸载时上报队列中的剩余数据
   */
  _onPageUnload() {
    if (document.visibilityState === 'hidden' && this.queue.length > 0) {
      this.flushQueue();
    }
  }

  addToQueue(data) {
    if (!data || !this.config.serverUrl) return;

    this.queue.push(data);

    // 队列超过最大限制，立即上报
    if (this.queue.length >= this.config.reporter.maxQueueSize) {
      this.flushQueue();
      return;
    }

    // 队列达到批量大小，立即上报
    if (this.queue.length >= this.config.reporter.batchSize) {
      this.flushQueue();
      return;
    }

    // 设置定时上报
    this.scheduleFlush();
  }

  scheduleFlush() {
    if (this.timer) return;

    this.timer = setTimeout(() => {
      this.flushQueue();
    }, this.config.reporter.batchInterval);
  }

  flushQueue() {
    if (this.queue.length === 0) return;

    const batchData = [...this.queue];
    this.queue = [];

    // 清除定时器
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.report(batchData);
  }

  _reportError(errorData) {
    // 通过 EventBus 同步获取面包屑
    const breadcrumbs = eventBus.emit('behavior:getBreadcrumbs') || [];

    // 提取可序列化的错误信息，避免循环引用导致 JSON.stringify 失败
    const safeErrorData = {
      type: errorData.type,
      message: errorData.message,
      stack: errorData.stack,
      source: errorData.source,
      lineno: errorData.lineno,
      colno: errorData.colno,
      tagName: errorData.tagName,
      url: errorData.url,
      componentStack: errorData.componentStack,  // React ErrorBoundary
      info: errorData.info,                      // Vue errorHandler
      outerHTML: errorData.outerHTML,            // 资源加载错误
      componentName: errorData.componentName,    // Vue/React 组件名
      context: errorData.context                 // 手动上报的上下文
    };

    const data = {
      type: 'error',
      subType: errorData.type,
      timestamp: Date.now(),
      errorData: safeErrorData,
      breadcrumbs
    };

    this.addToQueue(data);
  }

  _reportPerformance(performanceData) {
    const data = {
      type: 'performance',
      subType: performanceData.type,
      timestamp: Date.now(),
      ...performanceData
    };

    this.addToQueue(data);
  }

  _reportBehavior(behaviorData) {
    if (!this.config.behavior.enable) return;

    const data = {
      type: 'behavior',
      subType: behaviorData.type,
      timestamp: Date.now(),
      ...behaviorData
    };

    this.addToQueue(data);
  }

  report(data) {
    if (!data || !this.config.serverUrl) return;

    // 通过 EventBus 同步获取 sessionId 和 userId
    const sessionId = eventBus.emit('core:getSessionId') || '';
    const userId = eventBus.emit('core:getUserId') || '';
    const userData = eventBus.emit('core:getUserData') || {};

    const reportData = {
      appKey: this.config.appKey,
      sessionId,
      userId,
      userData,
      data,
      timestamp: Date.now(),
      environment: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        url: window.location.href,
        referrer: document.referrer,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };

    const serializedData = JSON.stringify(reportData);

    switch (this.config.reporter.reportMethod) {
      case 'beacon':
        this.reportBeacon(serializedData);
        break;
      case 'image':
        this.reportImage(serializedData);
        break;
      case 'fetch':
      default:
        this.reportFetch(serializedData);
        break;
    }
  }

  reportFetch(data) {
    if (!window.fetch) {
      return this.reportImage(data);
    }

    fetch(`${this.config.serverUrl}/api/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-SDK-Internal': 'true'
      },
      body: data,
      credentials: 'include',
      keepalive: true
    }).catch((error) => {
      this.handleReportError(data, error);
    });
  }

  reportBeacon(data) {
    if (!window.navigator.sendBeacon) {
      return this.reportFetch(data);
    }

    const blob = new Blob([data], { type: 'application/json' });
    const success = window.navigator.sendBeacon(`${this.config.serverUrl}/api/report`, blob);
    if (!success) {
      this.reportFetch(data);
    }
  }

  reportImage(data) {
    try {
      const img = new Image();
      const encodedData = encodeURIComponent(data);
      const url = `${this.config.serverUrl}/api/report?data=${encodedData}`;

      img.src = url;
      img.onload = () => {
        img.onload = null;
        img.onerror = null;
      };
      img.onerror = () => {
        this.handleReportError(data, new Error('Image beacon failed'));
        img.onload = null;
        img.onerror = null;
      };
    } catch (error) {
      this.handleReportError(data, error);
    }
  }

  handleReportError(data, error) {
    const dataKey = JSON.stringify(data);
    const count = this.retryCount[dataKey] || 0;

    if (count < this.config.reporter.retryCount) {
      this.retryCount[dataKey] = count + 1;

      setTimeout(() => {
        this.report(data);
      }, this.config.reporter.retryDelay * Math.pow(2, count));
    } else {
      delete this.retryCount[dataKey];
      eventBus.emit('reporter:report:failed', { data, error });
    }
  }

  flush() {
    this.flushQueue();
  }

  destroy() {
    // 上报剩余数据
    this.flushQueue();

    // 使用保存的引用正确取消订阅
    eventBus.off('error:captured', this._boundHandlers.errorCaptured);
    eventBus.off('performance:web-vital', this._boundHandlers.webVital);
    eventBus.off('performance:resource', this._boundHandlers.resource);
    eventBus.off('performance:long-task', this._boundHandlers.longTask);
    eventBus.off('performance:memory', this._boundHandlers.memory);
    eventBus.off('behavior:breadcrumb', this._boundHandlers.breadcrumb);

    // 移除页面卸载监听
    if (this._unloadHandler) {
      window.removeEventListener('visibilitychange', this._unloadHandler);
      window.removeEventListener('pagehide', this._unloadHandler);
      this._unloadHandler = null;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this._boundHandlers = {};

    eventBus.emit('reporter:destroyed');
  }
}

export default DataReporter;
