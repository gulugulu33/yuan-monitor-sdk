class EventBus {
  constructor() {
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    return this;
  }

  once(event, callback) {
    const onceCallback = (...args) => {
      callback(...args);
      this.off(event, onceCallback);
    };
    return this.on(event, onceCallback);
  }

  off(event, callback) {
    if (!this.events[event]) return this;

    if (!callback) {
      delete this.events[event];
      return this;
    }

    this.events[event] = this.events[event].filter(cb => cb !== callback);
    return this;
  }

  /**
   * 触发事件，支持回调返回值
   * 如果只有一个监听器且有返回值，则返回该值（用于同步获取数据）
   * 如果有多个监听器，返回所有非 undefined 返回值组成的数组
   */
  emit(event, ...args) {
    if (!this.events[event]) return undefined;

    const callbacks = this.events[event];
    if (callbacks.length === 1) {
      try {
        return callbacks[0](...args);
      } catch (error) {
        if (typeof console !== 'undefined') {
          console.warn(`[Monitor] EventBus emit "${event}" error:`, error);
        }
      }
      return undefined;
    }

    const results = [];
    callbacks.forEach(callback => {
      try {
        const result = callback(...args);
        if (result !== undefined) {
          results.push(result);
        }
      } catch (error) {
        if (typeof console !== 'undefined') {
          console.warn(`[Monitor] EventBus emit "${event}" error:`, error);
        }
      }
    });
    return results.length > 0 ? results : undefined;
  }

  clear() {
    this.events = {};
    return this;
  }
}

export default new EventBus();