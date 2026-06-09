import eventBus from '../core/eventBus';

let rrwebModule = null;
let rrwebLoadPromise = null;

/**
 * 异步加载 rrweb 模块
 * 兼容 rrweb v1 和 v2 的导出方式
 */
async function loadRrweb() {
  if (rrwebModule) return rrwebModule;
  if (rrwebLoadPromise) return rrwebLoadPromise;

  rrwebLoadPromise = import('rrweb').then(module => {
    rrwebModule = module;
    return module;
  }).catch(error => {
    console.warn('[Monitor] rrweb 加载失败，录屏功能不可用:', error.message);
    rrwebLoadPromise = null;
    return null;
  });

  return rrwebLoadPromise;
}

/**
 * SessionReplay - 会话录屏回放模块（仿 Sentry 实现）
 *
 * 核心策略：始终后台录制 + 环形缓冲区
 * ────────────────────────────────────────
 * 1. 初始化时立即开启 rrweb 录制，不等待错误触发
 * 2. 使用环形缓冲区始终保留最近 N 秒的录屏数据
 * 3. 错误发生时：
 *    - 标记错误在事件流中的位置
 *    - 继续录制 replayAfterError 秒（默认10秒）
 *    - 截取「错误前 replayBeforeError 秒 + 错误后 N 秒」的完整片段上报
 * 4. 上报后继续后台录制，保持环形缓冲区运转
 *
 * 参考：Sentry Session Replay / LogRocket / FullStory
 */
class SessionReplay {
  constructor(config) {
    this.config = config;
    this.stopFn = null;           // rrweb record() 返回的停止函数
    this.isRecording = false;
    this.events = [];             // 环形缓冲区
    this.errorIndex = -1;         // 错误在缓冲区中的位置
    this.pendingErrorCount = 0;   // 待上报的错误计数
    this.lastErrorTime = 0;       // 最近一次错误时间戳
    this.autoReportTimer = null;  // 错误后延迟上报的定时器
    this.flushTimer = null;       // 定期 flush 的定时器
    this._errorHandler = null;    // 保存事件监听器引用，用于销毁时移除
  }

  init() {
    if (!this.config.advanced.enableSessionReplay) return;

    // 采样率控制：随机决定当前会话是否启用录屏
    if (Math.random() > this.config.advanced.sessionReplaySampleRate) {
      if (this.config.debug) {
        console.log('[Monitor] 录屏采样未命中，跳过录屏初始化');
      }
      return;
    }

    // 监听错误事件
    this._errorHandler = (errorData) => this._onErrorCaptured(errorData);
    eventBus.on('error:captured', this._errorHandler);

    // 立即开启后台持续录制
    this.startRecording();

    // 设置定期 flush，防止缓冲区数据堆积过久不上报
    const flushInterval = (this.config.advanced.maxReplayDuration || 60) * 1000;
    this.flushTimer = setInterval(() => {
      // 仅在有未上报错误时自动 flush
      if (this.pendingErrorCount > 0 && this.lastErrorTime > 0) {
        this._reportSessionReplay();
      }
    }, flushInterval);

    // 页面卸载时上报
    this._unloadHandler = () => this._onPageUnload();
    window.addEventListener('visibilitychange', this._unloadHandler);
    window.addEventListener('pagehide', this._unloadHandler);

    eventBus.emit('advanced:sessionReplay:initialized');

    if (this.config.debug) {
      console.log('[Monitor] 录屏模块已初始化，后台持续录制中');
    }
  }

  /**
   * 开启 rrweb 录制
   */
  startRecording() {
    if (this.isRecording) return;

    if (!rrwebModule) {
      loadRrweb().then(module => {
        if (module) {
          this._doStartRecording();
        }
      });
      return;
    }

    this._doStartRecording();
  }

  _doStartRecording() {
    if (this.isRecording) return;

    // 获取 record 函数，兼容 rrweb v1/v2
    const recordFn = rrwebModule.record || rrwebModule.default?.record;
    if (typeof recordFn !== 'function') {
      console.warn('[Monitor] rrweb record 函数不可用');
      return;
    }

    // 计算环形缓冲区最大事件数
    // rrweb 大约每秒产生 5~15 个事件，取上限 15 events/s
    const maxDuration = this.config.advanced.maxReplayDuration || 60;
    const maxEvents = maxDuration * 15;

    this.isRecording = true;
    this.events = [];

    try {
      this.stopFn = recordFn({
        emit: (event) => {
          this.events.push(event);

          // 环形缓冲区：超出上限时移除最早的事件
          if (this.events.length > maxEvents) {
            this.events.shift();
            // 同步调整错误标记位置
            if (this.errorIndex > 0) {
              this.errorIndex--;
            } else if (this.errorIndex === 0) {
              this.errorIndex = -1; // 错误标记已被移出缓冲区
            }
          }
        },
        recordCanvas: false,
        maskAllInputs: true,
        blockSelector: '.monitor-block',
        ignoreClass: 'monitor-ignore',
        maskTextSelector: 'input, textarea, [data-monitor-mask]'
      });

      eventBus.emit('advanced:sessionReplay:started');

      if (this.config.debug) {
        console.log('[Monitor] rrweb 录制已启动');
      }
    } catch (error) {
      console.warn('[Monitor] rrweb 录制启动失败:', error.message);
      this.isRecording = false;
    }
  }

  /**
   * 停止录制
   */
  stopRecording() {
    if (!this.isRecording) return;

    if (typeof this.stopFn === 'function') {
      this.stopFn();
    }
    this.stopFn = null;
    this.isRecording = false;

    this._clearAutoReportTimer();

    eventBus.emit('advanced:sessionReplay:stopped');
  }

  /**
   * 错误捕获回调 —— Sentry 策略的核心
   * 标记错误位置，延迟上报（继续录制错误后 N 秒）
   */
  _onErrorCaptured(errorData) {
    this.lastErrorTime = Date.now();
    this.errorIndex = this.events.length;
    this.pendingErrorCount++;

    // 如果 rrweb 还没加载完导致没在录制，立即启动
    if (!this.isRecording) {
      this.startRecording();
    }

    // 重置自动上报计时器：错误后继续录 N 秒再上报
    this._resetAutoReportTimer();

    if (this.config.debug) {
      console.log(`[Monitor] 录屏：捕获到错误，标记位置=${this.errorIndex}，${this.config.advanced.replayAfterError || 10}秒后上报`);
    }

    eventBus.emit('advanced:sessionReplay:errorCaptured', {
      errorTime: this.lastErrorTime,
      errorIndex: this.errorIndex,
      errorData
    });
  }

  /**
   * 重置自动上报计时器
   * 每次新错误都会重置，确保多个连续错误时不会提前上报
   */
  _resetAutoReportTimer() {
    this._clearAutoReportTimer();

    const afterErrorMs = (this.config.advanced.replayAfterError || 10) * 1000;

    this.autoReportTimer = setTimeout(() => {
      this._reportSessionReplay();
      // 上报后继续后台录制，环形缓冲区持续运转
    }, afterErrorMs);
  }

  _clearAutoReportTimer() {
    if (this.autoReportTimer) {
      clearTimeout(this.autoReportTimer);
      this.autoReportTimer = null;
    }
  }

  /**
   * 页面卸载时上报 —— 确保不丢数据
   */
  _onPageUnload() {
    if (document.visibilityState === 'hidden' && this.pendingErrorCount > 0) {
      this._reportSessionReplay();
    }
  }

  /**
   * 上报录屏数据 —— 从环形缓冲区截取「错误前 N 秒 + 错误后 N 秒」
   */
  _reportSessionReplay() {
    if (this.events.length === 0 || !this.config.serverUrl) return;

    const beforeErrorSec = this.config.advanced.replayBeforeError || 30;
    let relevantEvents;
    let errorOffset = -1;

    if (this.errorIndex >= 0 && this.errorIndex < this.events.length) {
      // 有错误标记：截取错误前后的事件
      // 估算错误前需要保留的事件数（按 ~10 events/s）
      const beforeErrorCount = beforeErrorSec * 10;
      const startIndex = Math.max(0, this.errorIndex - beforeErrorCount);

      relevantEvents = this.events.slice(startIndex);
      errorOffset = this.errorIndex - startIndex;
    } else {
      // 没有错误标记（防御性处理），取全部事件
      relevantEvents = [...this.events];
    }

    // 基于时间戳过滤，确保只保留目标时间窗口内的数据
    if (this.lastErrorTime > 0 && beforeErrorSec > 0) {
      const cutoffTime = this.lastErrorTime - beforeErrorSec * 1000;
      const filtered = [];
      let newErrorOffset = -1;

      for (let i = 0; i < relevantEvents.length; i++) {
        if (relevantEvents[i].timestamp >= cutoffTime) {
          if (newErrorOffset === -1 && i >= errorOffset) {
            newErrorOffset = filtered.length;
          }
          filtered.push(relevantEvents[i]);
        }
      }

      relevantEvents = filtered;
      errorOffset = newErrorOffset >= 0 ? newErrorOffset : errorOffset;
    }

    if (relevantEvents.length === 0) return;

    const data = {
      type: 'session-replay',
      timestamp: Date.now(),
      lastErrorTime: this.lastErrorTime,
      errorCount: this.pendingErrorCount,
      errorOffset,
      events: relevantEvents,
      duration: relevantEvents.length > 1
        ? relevantEvents[relevantEvents.length - 1].timestamp - relevantEvents[0].timestamp
        : 0
    };

    this._sendReport(data);

    // 重置错误状态，但不清空缓冲区（继续环形录制）
    this.pendingErrorCount = 0;
    this.errorIndex = -1;

    eventBus.emit('advanced:sessionReplay:reported', {
      eventCount: relevantEvents.length,
      errorOffset,
      duration: data.duration
    });

    if (this.config.debug) {
      console.log(`[Monitor] 录屏数据已上报，事件数=${relevantEvents.length}，时长=${data.duration}ms`);
    }
  }

  /**
   * 发送上报数据
   * 直接上报，不经过 DataReporter 队列（录屏数据较大）
   */
  _sendReport(data) {
    // 通过 EventBus 同步获取 sessionId 和 userId
    const sessionId = eventBus.emit('core:getSessionId') || '';
    const userId = eventBus.emit('core:getUserId') || '';

    const reportData = {
      appKey: this.config.appKey,
      sessionId,
      userId,
      data,
      timestamp: Date.now()
    };

    if (!this.config.serverUrl) return;

    try {
      const serializedData = JSON.stringify(reportData);

      // 优先使用 sendBeacon（页面卸载时也能发送）
      if (navigator.sendBeacon) {
        const blob = new Blob([serializedData], { type: 'application/json' });
        const success = navigator.sendBeacon(
          `${this.config.serverUrl}/api/session-replay`,
          blob
        );
        if (success) return;
      }

      // 降级到 fetch + keepalive
      fetch(`${this.config.serverUrl}/api/session-replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializedData,
        credentials: 'include',
        keepalive: true
      }).catch(err => {
        if (this.config.debug) {
          console.warn('[Monitor] 录屏数据上报失败:', err.message);
        }
      });
    } catch (error) {
      if (this.config.debug) {
        console.warn('[Monitor] 录屏数据序列化失败:', error.message);
      }
    }
  }

  /**
   * 获取当前缓冲区中的事件（调试用）
   */
  getEvents() {
    return [...this.events];
  }

  /**
   * 销毁模块，清理所有资源
   */
  destroy() {
    // 如果有待上报的错误，先上报
    if (this.pendingErrorCount > 0) {
      this._reportSessionReplay();
    }

    this.stopRecording();

    // 移除事件监听
    if (this._errorHandler) {
      eventBus.off('error:captured', this._errorHandler);
      this._errorHandler = null;
    }

    // 清理定时器
    this._clearAutoReportTimer();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // 移除页面卸载监听
    if (this._unloadHandler) {
      window.removeEventListener('visibilitychange', this._unloadHandler);
      window.removeEventListener('pagehide', this._unloadHandler);
      this._unloadHandler = null;
    }

    this.events = [];
    this.errorIndex = -1;
    this.pendingErrorCount = 0;
    this.lastErrorTime = 0;

    eventBus.emit('advanced:sessionReplay:destroyed');
  }
}

export default SessionReplay;
