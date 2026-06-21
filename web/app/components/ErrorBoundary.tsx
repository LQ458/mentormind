'use client'

import React from 'react'
import ReportIssueButton from './ReportIssueButton'
import { useLanguage } from './LanguageContext'
import { track } from '../lib/telemetry'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: (error: Error, reset: () => void) => React.ReactNode
  onError?: (error: Error, info: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
  componentStack: string
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: '' }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, componentStack: '' }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.props.onError?.(error, info)
    this.setState({ componentStack: info.componentStack || '' })
    if (typeof window !== 'undefined') {
      console.error('[ErrorBoundary]', error, info.componentStack)
      track('error_console', {
        source: 'error_boundary',
        message: error.message.slice(0, 256),
        kind: 'react_render',
        component_stack: (info.componentStack || '').slice(0, 1200),
      })
    }
  }

  reset = () => this.setState({ error: null, componentStack: '' })

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset)
      return (
        <DefaultFallback
          error={this.state.error}
          componentStack={this.state.componentStack}
          reset={this.reset}
        />
      )
    }
    return this.props.children
  }
}

function DefaultFallback({
  error,
  componentStack,
  reset,
}: {
  error: Error
  componentStack: string
  reset: () => void
}) {
  const { language } = useLanguage()
  const lang = language === 'zh' ? 'zh' : 'en'

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="text-3xl" aria-hidden>⚠️</span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-rose-900">
              {lang === 'zh' ? '出错了' : 'Something went wrong'}
            </h2>
            <p className="text-sm text-rose-700 mt-1">
              {lang === 'zh'
                ? '页面渲染时遇到错误。可以重试，或把错误发给我们。'
                : 'The page hit a rendering error. You can retry or send us the error.'}
            </p>
            <div className="mt-3 rounded border border-rose-100 bg-white/70 p-2 text-xs text-rose-800">
              {lang === 'zh'
                ? '错误详情会随报告一起提交。'
                : 'Error details will be attached to the report.'}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="px-4 py-2 rounded-md bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-colors"
              >
                {lang === 'zh' ? '重试' : 'Retry'}
              </button>
              <a
                href="/"
                className="px-4 py-2 rounded-md bg-white border border-rose-200 text-rose-700 text-sm font-medium hover:bg-rose-100 transition-colors"
              >
                {lang === 'zh' ? '返回首页' : 'Home'}
              </a>
            </div>
            <div className="mt-3">
              <ReportIssueButton
                surface="error_boundary"
                compact
                label={lang === 'zh' ? '报告这个错误' : 'Report this error'}
                severity="blocked"
                snapshot={{
                  error_message: error.message.slice(0, 400),
                  component_stack: componentStack.slice(0, 1200),
                  area: 'react_error_boundary',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
