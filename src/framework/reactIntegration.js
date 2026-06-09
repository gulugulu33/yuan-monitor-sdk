import eventBus from '../core/eventBus';

/**
 * 创建 ErrorBoundary 组件
 * 接受 React 作为参数，避免 SDK 直接硬依赖 React
 */
const createErrorBoundary = (React) => {
  if (!React || !React.Component) {
    console.warn('[Monitor] React 未找到，ErrorBoundary 不可用');
    return null;
  }

  const { Component } = React;

  class ErrorBoundary extends Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
      return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
      this.setState({ errorInfo });

      const errorData = {
        type: 'react',
        message: error?.message || 'Unknown React error',
        componentStack: errorInfo?.componentStack,
        stack: error?.stack,
        error
      };

      eventBus.emit('error:captured', errorData);

      if (this.props.onError) {
        this.props.onError(error, errorInfo);
      }
    }

    render() {
      if (this.state.hasError) {
        if (this.props.fallback) {
          return typeof this.props.fallback === 'function'
            ? this.props.fallback(this.state.error, this.state.errorInfo)
            : this.props.fallback;
        }

        return React.createElement('div', {
          style: {
            padding: '20px',
            border: '1px solid #f56c6c',
            borderRadius: '4px',
            backgroundColor: '#fef0f0',
            color: '#f56c6c'
          }
        },
          React.createElement('h2', null, 'Something went wrong.'),
          React.createElement('details', {
            style: { whiteSpace: 'pre-wrap' }
          },
            this.state.error && this.state.error.toString(),
            React.createElement('br'),
            this.state.errorInfo?.componentStack
          )
        );
      }

      return this.props.children;
    }
  }

  return ErrorBoundary;
};

class ReactIntegration {
  constructor(config) {
    this.config = config;
    this.ErrorBoundary = null;
    this.React = null;
  }

  init() {
    if (!this.config.framework.react) return;

    // 尝试多种方式获取 React
    this._loadReact();

    eventBus.emit('framework:react:integrated');
  }

  /**
   * 尝试加载 React，兼容 CommonJS 和 ESM
   */
  _loadReact() {
    try {
      // 方式1: CommonJS require
      this.React = require('react');
    } catch (e) {
      // 方式2: 全局变量（CDN 引入场景）
      if (typeof window !== 'undefined' && window.React) {
        this.React = window.React;
      }
    }

    if (this.React) {
      this.ErrorBoundary = createErrorBoundary(this.React);
    }
  }

  /**
   * 获取 ErrorBoundary 组件
   * 如果 React 尚未加载，返回 null
   */
  getErrorBoundary() {
    if (!this.ErrorBoundary && this.React) {
      this.ErrorBoundary = createErrorBoundary(this.React);
    }
    return this.ErrorBoundary;
  }

  /**
   * 设置 React 引用（供外部主动传入，解决动态加载场景）
   */
  setReact(React) {
    if (!React) return;
    this.React = React;
    this.ErrorBoundary = createErrorBoundary(React);
  }

  /**
   * 自动包装应用根组件
   */
  wrapApp(AppComponent) {
    if (!AppComponent || !this.React) return AppComponent;

    const ErrorBoundary = this.getErrorBoundary();
    if (!ErrorBoundary) return AppComponent;

    const { Component } = this.React;
    const { createElement } = this.React;

    return class WrappedApp extends Component {
      render() {
        return createElement(ErrorBoundary, null,
          createElement(AppComponent, this.props)
        );
      }
    };
  }
}

export default ReactIntegration;
