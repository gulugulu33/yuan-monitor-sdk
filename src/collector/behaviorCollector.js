import eventBus from '../core/eventBus';

class BehaviorCollector {
  constructor(config) {
    this.config = config;
    this.breadcrumbs = [];
    this.lastHref = typeof document !== 'undefined' ? document.location.href : '';

    // 保存原始引用，用于 destroy 时恢复
    this.originalPushState = null;
    this.originalReplaceState = null;
    this.originalXHROpen = null;
    this.originalXHRSend = null;
    this.originalFetch = null;
    this.originalConsole = {};

    this.xhrHandlerInitialized = false;
    this.fetchHandlerInitialized = false;

    // 保存事件监听器引用，用于 destroy 时移除
    this._clickHandler = null;
    this._popstateHandler = null;
    this._hashchangeHandler = null;
  }

  init() {
    if (!this.config.behavior.enable) return;

    // 响应面包屑查询
    eventBus.on('behavior:getBreadcrumbs', () => this.getBreadcrumbs());

    if (this.config.behavior.captureClicks) {
      this.setupClickHandler();
    }

    if (this.config.behavior.captureRouteChanges) {
      this.setupRouteChangeHandler();
    }

    if (this.config.behavior.captureNetworkRequests) {
      this.setupNetworkRequestHandler();
    }

    if (this.config.behavior.captureConsole) {
      this.setupConsoleHandler();
    }

    eventBus.emit('collector:behavior:initialized');
  }

  addBreadcrumb(type, data) {
    const breadcrumb = {
      type,
      timestamp: Date.now(),
      ...data
    };

    this.breadcrumbs.push(breadcrumb);

    // 限制面包屑数量
    if (this.breadcrumbs.length > this.config.behavior.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }

    eventBus.emit('behavior:breadcrumb', breadcrumb);
    return breadcrumb;
  }

  getBreadcrumbs() {
    return [...this.breadcrumbs];
  }

  clearBreadcrumbs() {
    this.breadcrumbs = [];
    eventBus.emit('behavior:breadcrumbs:cleared');
  }

  setupClickHandler() {
    this._clickHandler = (event) => {
      const target = event.target;
      if (!target || target.tagName === 'BODY') return;

      const tagName = target.tagName.toLowerCase();
      const id = target.id ? `id="${target.id}"` : '';
      const className = target.className ? `class="${target.className}"` : '';
      const text = target.textContent ? target.textContent.trim().substring(0, 100) : '';

      const domInfo = `<${tagName} ${id} ${className}>${text}</${tagName}>`;

      this.addBreadcrumb('click', {
        dom: domInfo,
        tagName,
        id: target.id,
        className: target.className,
        text,
        x: event.clientX,
        y: event.clientY
      });
    };
    document.addEventListener('click', this._clickHandler, true);
  }

  setupRouteChangeHandler() {
    // 保存原始 history 方法
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;

    const handleRouteChange = (method, args) => {
      const url = args.length > 2 ? args[2] : undefined;
      if (url) {
        const from = this.lastHref;
        const to = String(url);
        this.lastHref = to;

        this.addBreadcrumb('route', {
          method,
          from,
          to,
          fullUrl: window.location.origin + to
        });
      }
    };

    history.pushState = (...args) => {
      handleRouteChange('pushState', args);
      return this.originalPushState.apply(history, args);
    };

    history.replaceState = (...args) => {
      handleRouteChange('replaceState', args);
      return this.originalReplaceState.apply(history, args);
    };

    // 监听 popstate 事件
    this._popstateHandler = () => {
      const from = this.lastHref;
      const to = window.location.href;
      this.lastHref = to;

      this.addBreadcrumb('route', {
        method: 'popstate',
        from,
        to
      });
    };
    window.addEventListener('popstate', this._popstateHandler);

    // 监听 hashchange 事件
    this._hashchangeHandler = () => {
      const from = this.lastHref;
      const to = window.location.href;
      this.lastHref = to;

      this.addBreadcrumb('route', {
        method: 'hashchange',
        from,
        to
      });
    };
    window.addEventListener('hashchange', this._hashchangeHandler);
  }

  setupNetworkRequestHandler() {
    this.setupXHRHandler();
    this.setupFetchHandler();
  }

  setupXHRHandler() {
    if (!window.XMLHttpRequest) return;
    if (this.xhrHandlerInitialized) return;
    this.xhrHandlerInitialized = true;

    // 保存原始方法
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;
    const collector = this;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._monitor = {
        method: method.toUpperCase(),
        url: String(url),
        startTime: Date.now()
      };
      return collector.originalXHROpen.apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function(body, ...args) {
      if (this._monitor && this._monitor.url.includes('X-SDK-Internal')) {
        return collector.originalXHRSend.apply(this, [body, ...args]);
      }

      if (this._monitor) {
        this._monitor.reqData = body;

        const xhr = this;

        const handleLoad = () => {
          const endTime = Date.now();
          collector.addBreadcrumb('xhr', {
            method: xhr._monitor.method,
            url: xhr._monitor.url,
            startTime: xhr._monitor.startTime,
            endTime,
            elapsedTime: endTime - xhr._monitor.startTime,
            status: xhr.status,
            type: 'xhr'
          });
        };

        const handleError = () => {
          const endTime = Date.now();
          collector.addBreadcrumb('xhr', {
            method: xhr._monitor.method,
            url: xhr._monitor.url,
            startTime: xhr._monitor.startTime,
            endTime,
            elapsedTime: endTime - xhr._monitor.startTime,
            status: xhr.status,
            error: true,
            type: 'xhr'
          });
        };

        xhr.addEventListener('load', handleLoad);
        xhr.addEventListener('error', handleError);
        xhr.addEventListener('abort', handleError);
      }

      return collector.originalXHRSend.apply(this, [body, ...args]);
    };
  }

  setupFetchHandler() {
    if (!window.fetch) return;
    if (this.fetchHandlerInitialized) return;
    this.fetchHandlerInitialized = true;

    this.originalFetch = window.fetch;

    const collector = this;

    window.fetch = async (url, config = {}) => {
      const headers = config.headers || {};
      const isSdkInternal = headers['X-SDK-Internal'] === 'true';

      if (isSdkInternal) {
        return collector.originalFetch(url, config);
      }

      const startTime = Date.now();
      const method = (config.method || 'GET').toUpperCase();

      const monitorData = {
        method,
        url: String(url),
        startTime,
        reqData: config.body,
        type: 'fetch'
      };

      try {
        const response = await collector.originalFetch(url, config);
        const endTime = Date.now();

        monitorData.endTime = endTime;
        monitorData.elapsedTime = endTime - startTime;
        monitorData.status = response.status;

        collector.addBreadcrumb('fetch', monitorData);

        return response;
      } catch (error) {
        const endTime = Date.now();

        monitorData.endTime = endTime;
        monitorData.elapsedTime = endTime - startTime;
        monitorData.error = true;
        monitorData.errorMessage = error.message;

        collector.addBreadcrumb('fetch', {
          ...monitorData,
          error: true
        });

        throw error;
      }
    };
  }

  setupConsoleHandler() {
    const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'];

    consoleMethods.forEach(method => {
      if (typeof console[method] === 'function') {
        this.originalConsole[method] = console[method];

        console[method] = (...args) => {
          this.addBreadcrumb('console', {
            method,
            args: args.map(arg => {
              try {
                if (typeof arg === 'object') {
                  return JSON.stringify(arg);
                }
                return String(arg);
              } catch (e) {
                return '[Object]';
              }
            })
          });

          return this.originalConsole[method].apply(console, args);
        };
      }
    });
  }

  destroy() {
    // 恢复原始 history 方法
    if (this.originalPushState) {
      history.pushState = this.originalPushState;
      this.originalPushState = null;
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }

    // 恢复原始 XHR 方法
    if (this.originalXHROpen) {
      XMLHttpRequest.prototype.open = this.originalXHROpen;
      this.originalXHROpen = null;
    }
    if (this.originalXHRSend) {
      XMLHttpRequest.prototype.send = this.originalXHRSend;
      this.originalXHRSend = null;
    }

    // 恢复原始 fetch
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
      this.originalFetch = null;
    }

    // 恢复原始控制台方法
    for (const method in this.originalConsole) {
      if (this.originalConsole.hasOwnProperty(method)) {
        console[method] = this.originalConsole[method];
      }
    }
    this.originalConsole = {};

    // 移除 DOM 事件监听
    if (this._clickHandler) {
      document.removeEventListener('click', this._clickHandler, true);
      this._clickHandler = null;
    }
    if (this._popstateHandler) {
      window.removeEventListener('popstate', this._popstateHandler);
      this._popstateHandler = null;
    }
    if (this._hashchangeHandler) {
      window.removeEventListener('hashchange', this._hashchangeHandler);
      this._hashchangeHandler = null;
    }

    // 移除 EventBus 监听
    eventBus.off('behavior:getBreadcrumbs');

    this.xhrHandlerInitialized = false;
    this.fetchHandlerInitialized = false;

    eventBus.emit('collector:behavior:destroyed');
  }
}

export default BehaviorCollector;
