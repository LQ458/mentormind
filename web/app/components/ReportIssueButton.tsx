'use client'

import { Flag } from 'lucide-react'
import { useLanguage } from './LanguageContext'
import { openFeedback, type FeedbackKind, type FeedbackSeverity } from './feedbackEvents'
import { track } from '../lib/telemetry'

interface ReportIssueButtonProps {
  surface: string
  snapshot?: Record<string, unknown>
  label?: string
  fixed?: boolean
  compact?: boolean
  className?: string
  feedbackKind?: FeedbackKind
  severity?: FeedbackSeverity
}

function makeInteractionId(surface: string): string {
  return `${surface.replace(/[^a-z0-9_-]+/gi, '-')}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export default function ReportIssueButton({
  surface,
  snapshot,
  label,
  fixed = false,
  compact = false,
  className = '',
  feedbackKind = 'bug',
  severity = 'confusing',
}: ReportIssueButtonProps) {
  const { language } = useLanguage()
  const lang = language === 'zh' ? 'zh' : 'en'
  const text = label || (lang === 'zh' ? '报告问题' : 'Report')
  const feedbackSource = fixed ? 'global_feedback_button' : 'local_report_button'

  const baseClass = compact
    ? 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-amber-300/70 bg-amber-50 px-3 text-xs font-semibold text-amber-800 shadow-sm hover:bg-amber-100'
    : 'inline-flex h-10 items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-900 shadow-lg hover:bg-amber-100'

  const fixedClass = fixed
    ? 'fixed bottom-20 right-5 z-[180]'
    : ''

  return (
    <button
      type="button"
      className={`${baseClass} ${fixedClass} ${className}`.trim()}
      aria-label={lang === 'zh' ? '报告当前页面问题' : 'Report a problem on this page'}
      title={lang === 'zh' ? '报告问题，会自动带上页面和最近错误' : 'Report a problem with page and recent-error context'}
      onClick={() => {
        track('feedback_click', {
          source: fixed ? 'fixed_report_button' : 'local_report_button',
          surface,
        })
        openFeedback({
          surface,
          source: feedbackSource,
          interactionId: makeInteractionId(surface),
          feedbackKind,
          severity,
          snapshot: {
            ...snapshot,
            report_button: fixed ? 'fixed' : 'local',
          },
        })
      }}
    >
      <Flag size={compact ? 14 : 16} aria-hidden />
      <span>{text}</span>
    </button>
  )
}
