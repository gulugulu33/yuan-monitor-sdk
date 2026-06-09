import React, { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { init } from 'yuan-monitor-sdk'

// 初始化监控SDK
const monitor = init({
  appKey: 'test-app-key',
  serverUrl: 'http://localhost:3001',
  debug: true,
  framework: {
    react: true
  },
  advanced: {
    enableSessionReplay: true,
    sessionReplaySampleRate: 1
  },
  reporter: {
    reportMethod: 'fetch',
    debug: true
  }
})

// 主动传入 React 引用，确保 ErrorBoundary 立即可用
monitor.setReact(React)

const ErrorBoundary = monitor.ErrorBoundary || React.Fragment

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App monitor={monitor} />
    </ErrorBoundary>
  </StrictMode>,
)
