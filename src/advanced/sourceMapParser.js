import eventBus from '../core/eventBus';

/**
 * SourceMapParser - Source Map 堆栈解析模块
 *
 * 功能：
 * 1. 解析错误堆栈中的行列号，映射回源代码原始位置
 * 2. 通过 Source Map 文件将打包后的位置还原为源码位置
 * 3. 上报还原后的堆栈信息，便于定位问题
 *
 * 工作流程：
 * 1. 拦截 error:captured 事件，提取堆栈中的文件路径和行列号
 * 2. 请求对应的 .map 文件
 * 3. 使用 source-map 库解析映射关系
 * 4. 将还原后的堆栈附加到错误数据中
 *
 * 注意：Source Map 解析通常应在服务端进行（避免暴露源码），
 * 此模块提供客户端轻量解析能力，适用于开发/测试环境。
 * 生产环境建议通过 serverUrl 配置服务端解析接口。
 */
class SourceMapParser {
  constructor(config) {
    this.config = config;
    this._cache = new Map();       // 缓存已解析的 Source Map
    this._errorHandler = null;
    this._sourceMapConsumer = null; // source-map 库的 Consumer
  }

  init() {
    const smConfig = this.config.advanced.sourceMap || {};
    if (!smConfig.enable) return;

    this.options = {
      // Source Map 文件路径模板，{file} 会被替换为原始文件路径
      // 例如：'https://cdn.example.com/maps/{file}.map'
      mapUrlTemplate: smConfig.mapUrlTemplate || '',
      // 服务端解析接口（优先使用服务端解析）
      serverParseUrl: smConfig.serverParseUrl || '',
      // 是否缓存解析结果
      cache: smConfig.cache !== false,
      // 最大缓存条目数
      maxCacheSize: smConfig.maxCacheSize || 50,
      // 堆栈最大解析深度
      maxStackDepth: smConfig.maxStackDepth || 10
    };

    // 监听错误事件，在 DataReporter 处理前解析堆栈
    this._errorHandler = (errorData) => this._onErrorCaptured(errorData);
    eventBus.on('error:captured', this._errorHandler);

    // 尝试加载 source-map 库
    this._loadSourceMapLib();

    eventBus.emit('advanced:sourceMap:initialized');
  }

  /**
   * 异步加载 source-map 库
   */
  async _loadSourceMapLib() {
    try {
      const module = await import('source-map');
      this._sourceMapConsumer = module.SourceMapConsumer || module.default?.SourceMapConsumer;
      if (this._sourceMapConsumer) {
        if (this.config.debug) {
          console.log('[Monitor] source-map 库加载成功');
        }
      }
    } catch (error) {
      if (this.config.debug) {
        console.warn('[Monitor] source-map 库加载失败，将使用服务端解析:', error.message);
      }
    }
  }

  /**
   * 错误捕获回调：解析堆栈中的 Source Map
   */
  _onErrorCaptured(errorData) {
    if (!errorData.stack) return;

    const stackFrames = this._parseStackFrames(errorData.stack);
    if (stackFrames.length === 0) return;

    // 如果有服务端解析接口，发送到服务端
    if (this.options.serverParseUrl) {
      this._parseOnServer(stackFrames).then(parsedFrames => {
        if (parsedFrames.length > 0) {
          errorData.originalStack = parsedFrames;
          eventBus.emit('advanced:sourceMap:parsed', {
            originalStack: parsedFrames,
            errorData
          });
        }
      }).catch(() => {});
      return;
    }

    // 客户端解析（需要 source-map 库）
    if (this._sourceMapConsumer) {
      this._parseOnClient(stackFrames).then(parsedFrames => {
        if (parsedFrames.length > 0) {
          errorData.originalStack = parsedFrames;
          eventBus.emit('advanced:sourceMap:parsed', {
            originalStack: parsedFrames,
            errorData
          });
        }
      }).catch(() => {});
    }
  }

  /**
   * 解析错误堆栈字符串，提取文件路径和行列号
   * @param {string} stack - 错误堆栈字符串
   * @returns {Array} 堆栈帧列表
   */
  _parseStackFrames(stack) {
    const frames = [];
    const lines = stack.split('\n');
    const stackRegex = /^\s*at\s+(?:(.*?)\s+\()?(.*?):(\d+):(\d+)\)?$/;

    for (const line of lines) {
      const match = line.match(stackRegex);
      if (match) {
        const [, functionName, filePath, line, column] = match;
        // 过滤掉非项目文件（如浏览器扩展、node_modules）
        if (filePath && !filePath.startsWith('chrome') && !filePath.includes('node_modules')) {
          frames.push({
            functionName: functionName || '<anonymous>',
            filePath,
            line: parseInt(line, 10),
            column: parseInt(column, 10)
          });

          if (frames.length >= this.options.maxStackDepth) break;
        }
      }
    }

    return frames;
  }

  /**
   * 客户端解析：使用 source-map 库
   */
  async _parseOnClient(stackFrames) {
    const parsedFrames = [];

    for (const frame of stackFrames) {
      const sourceMapUrl = this._getSourceMapUrl(frame.filePath);
      if (!sourceMapUrl) continue;

      try {
        const consumer = await this._getSourceMapConsumer(sourceMapUrl);
        if (!consumer) continue;

        const originalPosition = consumer.originalPositionFor({
          line: frame.line,
          column: frame.column
        });

        if (originalPosition && originalPosition.source) {
          parsedFrames.push({
            functionName: originalPosition.name || frame.functionName,
            filePath: originalPosition.source,
            line: originalPosition.line,
            column: originalPosition.column,
            originalFilePath: frame.filePath,
            originalLine: frame.line,
            originalColumn: frame.column
          });
        }
      } catch (error) {
        if (this.config.debug) {
          console.warn('[Monitor] Source Map 解析失败:', frame.filePath, error.message);
        }
      }
    }

    return parsedFrames;
  }

  /**
   * 服务端解析：发送堆栈帧到服务端接口
   */
  async _parseOnServer(stackFrames) {
    try {
      const response = await fetch(this.options.serverParseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames: stackFrames }),
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        return result.frames || [];
      }
    } catch (error) {
      if (this.config.debug) {
        console.warn('[Monitor] 服务端 Source Map 解析失败:', error.message);
      }
    }

    return [];
  }

  /**
   * 获取 Source Map 文件 URL
   */
  _getSourceMapUrl(filePath) {
    if (this.options.mapUrlTemplate) {
      return this.options.mapUrlTemplate.replace('{file}', filePath);
    }
    // 默认：在文件同目录下查找 .map 文件
    return filePath + '.map';
  }

  /**
   * 获取 SourceMapConsumer（带缓存）
   */
  async _getSourceMapConsumer(sourceMapUrl) {
    // 检查缓存
    if (this.options.cache && this._cache.has(sourceMapUrl)) {
      return this._cache.get(sourceMapUrl);
    }

    try {
      const response = await fetch(sourceMapUrl);
      if (!response.ok) return null;

      const rawSourceMap = await response.json();
      const consumer = await new this._sourceMapConsumer(rawSourceMap);

      // 缓存
      if (this.options.cache) {
        if (this._cache.size >= this.options.maxCacheSize) {
          // 移除最早的缓存
          const firstKey = this._cache.keys().next().value;
          const oldConsumer = this._cache.get(firstKey);
          if (oldConsumer && typeof oldConsumer.destroy === 'function') {
            oldConsumer.destroy();
          }
          this._cache.delete(firstKey);
        }
        this._cache.set(sourceMapUrl, consumer);
      }

      return consumer;
    } catch (error) {
      if (this.config.debug) {
        console.warn('[Monitor] Source Map 文件获取失败:', sourceMapUrl, error.message);
      }
      return null;
    }
  }

  /**
   * 手动解析堆栈
   * @param {string} stack - 错误堆栈字符串
   * @returns {Promise<Array>} 解析后的堆栈帧
   */
  async parseStack(stack) {
    const frames = this._parseStackFrames(stack);
    if (frames.length === 0) return [];

    if (this.options.serverParseUrl) {
      return this._parseOnServer(frames);
    }

    if (this._sourceMapConsumer) {
      return this._parseOnClient(frames);
    }

    return frames;
  }

  /**
   * 销毁模块
   */
  destroy() {
    if (this._errorHandler) {
      eventBus.off('error:captured', this._errorHandler);
      this._errorHandler = null;
    }

    // 清理缓存
    for (const [, consumer] of this._cache) {
      if (consumer && typeof consumer.destroy === 'function') {
        consumer.destroy();
      }
    }
    this._cache.clear();

    this._sourceMapConsumer = null;

    eventBus.emit('advanced:sourceMap:destroyed');
  }
}

export default SourceMapParser;
