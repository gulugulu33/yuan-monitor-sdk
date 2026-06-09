import eventBus from '../core/eventBus';

/**
 * VueIntegration - 支持 Vue 2 和 Vue 3 的错误捕获集成
 *
 * Vue 2: Vue.config.errorHandler + Vue.mixin
 * Vue 3: app.config.errorHandler
 */
class VueIntegration {
  constructor(config) {
    this.config = config;
    this.originalErrorHandler = null;
    this.vueVersion = null;
    this.app = null;       // Vue 3 app 实例
    this.Vue = null;       // Vue 2 构造函数
  }

  /**
   * 安装 Vue 错误捕获
   * @param {Object} Vue - Vue 2 构造函数 或 Vue 3 app 实例
   * @param {Object} [options] - 可选配置
   * @param {boolean} [options.isVue3] - 强制指定是否为 Vue 3
   */
  install(Vue, options = {}) {
    if (!Vue) return;

    // 自动检测 Vue 版本
    if (options.isVue3 || Vue.version?.startsWith('3') || Vue.config?.globalProperties) {
      this._installVue3(Vue);
    } else if (Vue.version?.startsWith('2') || Vue.config?.errorHandler !== undefined) {
      this._installVue2(Vue);
    } else if (Vue.component) {
      // Vue 3 app 实例（没有 version 属性）
      this._installVue3(Vue);
    } else {
      console.warn('[Monitor] 无法识别 Vue 版本，跳过集成');
    }

    eventBus.emit('framework:vue:integrated');
  }

  /**
   * Vue 2 集成：Vue.config.errorHandler + Vue.mixin
   */
  _installVue2(Vue) {
    this.Vue = Vue;
    this.vueVersion = 2;

    this.originalErrorHandler = Vue.config.errorHandler;

    Vue.config.errorHandler = (err, vm, info) => {
      const errorData = {
        type: 'vue',
        message: err?.message || 'Unknown Vue error',
        componentName: vm?.$options?.name || vm?.constructor?.name || 'Unknown component',
        info,
        stack: err?.stack,
        error: err
      };

      eventBus.emit('error:captured', errorData);

      if (this.originalErrorHandler) {
        this.originalErrorHandler(err, vm, info);
      }
    };

    // Vue 2 全局混入，捕获生命周期钩子错误
    Vue.mixin({
      beforeCreate() {
        if (this.$options.methods) {
          Object.keys(this.$options.methods).forEach(methodName => {
            const originalMethod = this.$options.methods[methodName];
            if (typeof originalMethod === 'function') {
              this.$options.methods[methodName] = (...args) => {
                try {
                  return originalMethod.apply(this, args);
                } catch (err) {
                  eventBus.emit('error:captured', {
                    type: 'vue-method',
                    message: err?.message || 'Unknown Vue method error',
                    componentName: this.$options.name || 'Unknown component',
                    methodName,
                    stack: err?.stack,
                    error: err
                  });
                  throw err;
                }
              };
            }
          });
        }
      }
    });
  }

  /**
   * Vue 3 集成：app.config.errorHandler
   */
  _installVue3(app) {
    this.app = app;
    this.vueVersion = 3;

    // Vue 3 app 实例
    if (app.config && app.config.errorHandler !== undefined) {
      this.originalErrorHandler = app.config.errorHandler;

      app.config.errorHandler = (err, instance, info) => {
        const errorData = {
          type: 'vue',
          message: err?.message || 'Unknown Vue error',
          componentName: instance?.$options?.name || instance?.type?.name || 'Unknown component',
          info,
          stack: err?.stack,
          error: err
        };

        eventBus.emit('error:captured', errorData);

        if (this.originalErrorHandler) {
          this.originalErrorHandler(err, instance, info);
        }
      };
    }
  }

  /**
   * 卸载 Vue 错误捕获
   */
  uninstall() {
    if (this.vueVersion === 2 && this.Vue) {
      if (this.originalErrorHandler) {
        this.Vue.config.errorHandler = this.originalErrorHandler;
        this.originalErrorHandler = null;
      }
    } else if (this.vueVersion === 3 && this.app) {
      if (this.originalErrorHandler) {
        this.app.config.errorHandler = this.originalErrorHandler;
        this.originalErrorHandler = null;
      }
    }

    this.Vue = null;
    this.app = null;
    this.vueVersion = null;

    eventBus.emit('framework:vue:unintegrated');
  }
}

export default VueIntegration;