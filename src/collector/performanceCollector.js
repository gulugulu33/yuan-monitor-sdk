import eventBus from '../core/eventBus';

let webVitals = null;

async function loadWebVitals() {
  try {
    const module = await import('web-vitals');
    webVitals = module;
  } catch (error) {
    console.warn('web-vitals not found, web-vitals metrics will not be collected');
  }
}

class PerformanceCollector {
  constructor(config) {
    this.config = config;
    this.resourceObserver = null;
    this.longTaskObserver = null;
    this.memoryInterval = null;
    this._memoryLoadHandler = null;
  }
  
  init() {
    if (!this.config.performance.enable) return;
    
    if (this.config.performance.captureWebVitals) {
      this.setupWebVitalsCollector();
    }
    
    if (this.config.performance.captureResourceTiming) {
      this.setupResourceTimingCollector();
    }
    
    if (this.config.performance.captureLongTasks) {
      this.setupLongTasksCollector();
    }
    
    if (this.config.performance.captureMemory) {
      this.setupMemoryCollector();
    }
    
    eventBus.emit('collector:performance:initialized');
  }
  
  setupWebVitalsCollector() {
    if (webVitals) {
      this._setupWebVitalsHandlers();
    } else {
      loadWebVitals().then(() => {
        if (webVitals) {
          this._setupWebVitalsHandlers();
        }
      });
    }
  }
  
  _setupWebVitalsHandlers() {
    if (!webVitals) return;
    
    const handleWebVital = (metric) => {
      const data = {
        type: 'web-vital',
        name: metric.name,
        value: metric.value,
        delta: metric.delta,
        id: metric.id,
        entries: metric.entries,
        timestamp: Date.now()
      };
      
      eventBus.emit('performance:web-vital', data);
    };
    
    if (webVitals.onCLS) webVitals.onCLS(handleWebVital);
    if (webVitals.onFCP) webVitals.onFCP(handleWebVital);
    if (webVitals.onFID) webVitals.onFID(handleWebVital);
    if (webVitals.onLCP) webVitals.onLCP(handleWebVital);
    if (webVitals.onTTFB) webVitals.onTTFB(handleWebVital);
  }
  
  setupResourceTimingCollector() {
    if (!window.PerformanceObserver) return;
    
    if (!window.performance?.getEntriesByType) {
      return;
    }
    
    this.resourceObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (['fetch', 'xmlhttprequest', 'beacon'].includes(entry.initiatorType)) {
          return; // 过滤掉网络请求，由网络监控处理
        }
        
        const data = {
          type: 'resource',
          name: entry.name,
          entryType: entry.entryType,
          initiatorType: entry.initiatorType,
          startTime: entry.startTime,
          duration: entry.duration,
          responseEnd: entry.responseEnd,
          transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize,
          decodedBodySize: entry.decodedBodySize,
          nextHopProtocol: entry.nextHopProtocol,
          isCache: entry.transferSize === 0 || (entry.transferSize !== 0 && entry.encodedBodySize === 0),
          timestamp: Date.now()
        };
        
        eventBus.emit('performance:resource', data);
      });
    });
    
    if (window.performance.entryTypes && 'resource' in window.performance.entryTypes) {
      this.resourceObserver.observe({ type: 'resource', buffered: true });
    } else if (window.performance.entryTypes) {
      this.resourceObserver.observe({ entryTypes: ['resource'] });
    }
  }
  
  setupLongTasksCollector() {
    if (!window.PerformanceObserver || !window.performance?.entryTypes || !('longtask' in window.performance.entryTypes)) {
      return;
    }
    
    this.longTaskObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        const data = {
          type: 'long-task',
          duration: entry.duration,
          startTime: entry.startTime,
          attribution: entry.attribution,
          timestamp: Date.now()
        };
        
        eventBus.emit('performance:long-task', data);
      });
    });
    
    this.longTaskObserver.observe({ entryTypes: ['longtask'] });
  }
  
  setupMemoryCollector() {
    if (!window.performance || !window.performance.memory) return;
    
    const collectMemory = () => {
      const memory = window.performance.memory;
      const data = {
        type: 'memory',
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        totalJSHeapSize: memory.totalJSHeapSize,
        usedJSHeapSize: memory.usedJSHeapSize,
        timestamp: Date.now()
      };
      
      eventBus.emit('performance:memory', data);
    };
    
    // 页面加载完成后收集一次内存信息
    this._memoryLoadHandler = collectMemory;
    window.addEventListener('load', this._memoryLoadHandler);
    
    // 定期收集内存信息（每30秒）
    this.memoryInterval = setInterval(collectMemory, 30000);
  }
  
  getCurrentPerformance() {
    return {
      navigation: performance.getEntriesByType('navigation')[0],
      resources: performance.getEntriesByType('resource'),
      memory: window.performance?.memory
    };
  }
  
  destroy() {
    if (this.resourceObserver) {
      this.resourceObserver.disconnect();
    }
    
    if (this.longTaskObserver) {
      this.longTaskObserver.disconnect();
    }
    
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
    }

    if (this._memoryLoadHandler) {
      window.removeEventListener('load', this._memoryLoadHandler);
      this._memoryLoadHandler = null;
    }
    
    eventBus.emit('collector:performance:destroyed');
  }
}

export default PerformanceCollector;