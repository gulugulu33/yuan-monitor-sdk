import eventBus from '../core/eventBus';

/**
 * WhiteScreenDetector - 白屏检测模块
 *
 * 检测策略：
 * 1. 页面加载完成后，检查关键渲染区域是否有内容
 * 2. 采样页面关键 DOM 节点，判断是否为白屏
 * 3. 检测到白屏时上报错误事件
 *
 * 判定白屏的条件（满足任一）：
 * - 页面 body 无子元素或仅有空白元素
 * - 页面根容器（#root/#app）存在但内部无内容
 * - 页面首屏区域采样点全部为空白
 */
class WhiteScreenDetector {
  constructor(config) {
    this.config = config;
    this._checkTimer = null;
    this._loadHandler = null;
    this._detected = false;  // 避免重复上报
    this._breadcrumbHandler = null; // 保存面包屑监听器引用
  }

  init() {
    const wsConfig = this.config.advanced.whiteScreenDetection || {};
    if (!wsConfig.enable && !this.config.advanced.enableWhiteScreenDetection) return;

    this.options = {
      // 检测时机：页面加载后延迟多久开始检测（ms）
      delay: wsConfig.delay || 3000,
      // 根容器选择器列表（按优先级）
      rootSelectors: wsConfig.rootSelectors || ['#root', '#app', '#__next'],
      // 采样行数（在视口内均匀采样多少行）
      sampleRows: wsConfig.sampleRows || 10,
      // 采样列数
      sampleCols: wsConfig.sampleCols || 10,
      // 白屏阈值：采样点中空白占比超过此值则判定为白屏
      threshold: wsConfig.threshold || 0.9,
      // 是否在检测后持续监控（用于 SPA 路由切换后的白屏）
      continuous: wsConfig.continuous !== false,
      // 持续监控间隔（ms）
      continuousInterval: wsConfig.continuousInterval || 10000,
      // 白屏时截图（需要 canvas 支持）
      screenshot: wsConfig.screenshot || false
    };

    // 页面加载完成后延迟检测
    this._loadHandler = () => this._scheduleCheck();

    if (document.readyState === 'complete') {
      this._scheduleCheck();
    } else {
      window.addEventListener('load', this._loadHandler);
    }

    // SPA 路由切换后重新检测
    this._breadcrumbHandler = (breadcrumb) => {
      if (breadcrumb.type === 'route' && this.options.continuous && !this._detected) {
        this._scheduleCheck(this.options.delay / 2);
      }
    };
    eventBus.on('behavior:breadcrumb', this._breadcrumbHandler);

    eventBus.emit('advanced:whiteScreen:initialized');
  }

  /**
   * 延迟调度白屏检测
   */
  _scheduleCheck(delay) {
    if (this._checkTimer) clearTimeout(this._checkTimer);

    this._checkTimer = setTimeout(() => {
      this._doCheck();
    }, delay || this.options.delay);
  }

  /**
   * 执行白屏检测
   */
  _doCheck() {
    if (this._detected) return;

    const isWhiteScreen = this._checkRootContainer() || this._checkSampling();

    if (isWhiteScreen) {
      this._detected = true;
      this._reportWhiteScreen();
    } else if (this.options.continuous) {
      // 持续监控模式：定期重新检测
      this._checkTimer = setTimeout(() => {
        this._doCheck();
      }, this.options.continuousInterval);
    }
  }

  /**
   * 检查根容器是否为空
   * @returns {boolean} 根容器为空返回 true
   */
  _checkRootContainer() {
    for (const selector of this.options.rootSelectors) {
      const rootEl = document.querySelector(selector);
      if (rootEl) {
        // 根容器存在，检查是否有实质内容
        const hasContent = this._hasMeaningfulContent(rootEl);
        if (!hasContent) {
          return true;
        }
        // 根容器有内容，不是白屏
        return false;
      }
    }

    // 没有找到任何根容器，检查 body
    const body = document.body;
    if (!body || !this._hasMeaningfulContent(body)) {
      return true;
    }

    return false;
  }

  /**
   * 检查元素是否有有意义的内容
   */
  _hasMeaningfulContent(element) {
    if (!element) return false;

    // 检查文本内容
    const textContent = element.textContent?.trim();
    if (textContent && textContent.length > 0) {
      return true;
    }

    // 检查子元素（排除 script、style 等不可见元素）
    const visibleChildren = Array.from(element.children).filter(child => {
      const tag = child.tagName.toLowerCase();
      return !['script', 'style', 'link', 'meta', 'noscript'].includes(tag);
    });

    return visibleChildren.length > 0;
  }

  /**
   * 采样检测：在视口内均匀采样点，检查元素是否为空白
   * @returns {boolean} 采样点空白占比超过阈值返回 true
   */
  _checkSampling() {
    const { sampleRows, sampleCols, threshold } = this.options;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let emptyCount = 0;
    let totalPoints = 0;

    for (let row = 0; row < sampleRows; row++) {
      for (let col = 0; col < sampleCols; col++) {
        const x = Math.round((col + 0.5) * viewportWidth / sampleCols);
        const y = Math.round((row + 0.5) * viewportHeight / sampleRows);

        const element = document.elementFromPoint(x, y);

        totalPoints++;

        if (!element || element === document.documentElement || element === document.body) {
          emptyCount++;
        }
      }
    }

    const emptyRatio = totalPoints > 0 ? emptyCount / totalPoints : 1;
    return emptyRatio >= threshold;
  }

  /**
   * 上报白屏检测结果
   */
  _reportWhiteScreen() {
    const errorData = {
      type: 'whiteScreen',
      message: '检测到页面白屏',
      url: window.location.href,
      timestamp: Date.now(),
      rootSelector: this._findEmptyRootSelector(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };

    eventBus.emit('error:captured', errorData);

    if (this.config.debug) {
      console.warn('[Monitor] 检测到页面白屏:', errorData);
    }
  }

  /**
   * 找到空的根容器选择器
   */
  _findEmptyRootSelector() {
    for (const selector of this.options.rootSelectors) {
      const rootEl = document.querySelector(selector);
      if (rootEl && !this._hasMeaningfulContent(rootEl)) {
        return selector;
      }
    }
    return 'body';
  }

  /**
   * 重置检测状态（用于手动触发重新检测）
   */
  reset() {
    this._detected = false;
    this._scheduleCheck();
  }

  /**
   * 销毁模块
   */
  destroy() {
    if (this._checkTimer) {
      clearTimeout(this._checkTimer);
      this._checkTimer = null;
    }

    if (this._loadHandler) {
      window.removeEventListener('load', this._loadHandler);
      this._loadHandler = null;
    }

    if (this._breadcrumbHandler) {
      eventBus.off('behavior:breadcrumb', this._breadcrumbHandler);
      this._breadcrumbHandler = null;
    }

    eventBus.emit('advanced:whiteScreen:destroyed');
  }
}

export default WhiteScreenDetector;
