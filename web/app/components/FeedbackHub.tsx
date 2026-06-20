'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Bug, Check, Heart, Lightbulb, MessageSquare, Send, X } from 'lucide-react'
import { useLanguage } from './LanguageContext'
import { getTelemetryContextSnapshot, trackNow } from '../lib/telemetry'
import type { FeedbackKind, FeedbackLaunchContext, FeedbackSeverity } from './feedbackEvents'

type Severity = FeedbackSeverity

interface FeedbackHubProps {
  open: boolean
  onClose: () => void
  launchContext?: FeedbackLaunchContext | null
}

const KIND_OPTIONS: Array<{
  value: FeedbackKind
  icon: typeof Bug
  en: string
  zh: string
  enHint: string
  zhHint: string
}> = [
  {
    value: 'bug',
    icon: Bug,
    en: 'Report a bug',
    zh: '报错',
    enHint: 'Something failed, looked wrong, or blocked you.',
    zhHint: '功能失败、显示不对、流程卡住。',
  },
  {
    value: 'function',
    icon: Lightbulb,
    en: 'Function feedback',
    zh: '功能反馈',
    enHint: 'A feature is missing, awkward, or should work differently.',
    zhHint: '功能缺失、不顺手、或应该换一种做法。',
  },
  {
    value: 'feeling',
    icon: Heart,
    en: 'Feeling feedback',
    zh: '感受反馈',
    enHint: 'Too boring, too hard, not motivating, or surprisingly good.',
    zhHint: '无聊、太难、没动力，或哪里感觉很好。',
  },
  {
    value: 'general',
    icon: MessageSquare,
    en: 'General feedback',
    zh: '一般反馈',
    enHint: 'Anything else you want us to know.',
    zhHint: '其他任何想说的。',
  },
]

const SEVERITIES: Array<{ value: Severity; en: string; zh: string }> = [
  { value: 'blocked', en: 'Blocked', zh: '卡住' },
  { value: 'wrong', en: 'Wrong', zh: '不对' },
  { value: 'confusing', en: 'Confusing', zh: '困惑' },
  { value: 'slow', en: 'Slow', zh: '太慢' },
  { value: 'visual', en: 'Visual', zh: '界面' },
  { value: 'quality', en: 'Quality', zh: '质量' },
  { value: 'idea', en: 'Idea', zh: '建议' },
]

const FEEDBACK_TEXT_LIMIT = 1200
type SubmissionMode = 'recorded' | 'queued'

function makeInteractionId(kind: FeedbackKind): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `global-${kind}-${Date.now().toString(36)}-${random}`
}

function makeReportId(kind: FeedbackKind, surface: string): string {
  const safeSurface = surface.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 24) || 'global'
  return `fb-${safeSurface}-${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export default function FeedbackHub({ open, onClose, launchContext }: FeedbackHubProps) {
  const { language } = useLanguage()
  const lang = language === 'zh' ? 'zh' : 'en'
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [severity, setSeverity] = useState<Severity>('confusing')
  const [message, setMessage] = useState('')
  const [expected, setExpected] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null)
  const [submittedMode, setSubmittedMode] = useState<SubmissionMode | null>(null)

  useEffect(() => {
    if (!open) return
    setKind(launchContext?.feedbackKind || 'bug')
    setSeverity(launchContext?.severity || 'confusing')
    setSubmitted(false)
    setSubmitting(false)
    setSubmitError(null)
    setSubmittedReportId(null)
    setSubmittedMode(null)
    setMessage('')
    setExpected('')
  }, [launchContext, open])

  if (!open) return null

  const selectedKind = KIND_OPTIONS.find((item) => item.value === kind) || KIND_OPTIONS[0]

  const submit = async () => {
    if (submitting) return
    const userNote = message.trim()
    const expectedBehavior = expected.trim()
    if (!userNote && !expectedBehavior) {
      setSubmitError(
        lang === 'zh'
          ? '写一句也可以。这样我们才能把这条反馈变成可复现的问题。'
          : 'Add one short note so we can turn this into a reproducible issue.',
      )
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    const surface = launchContext?.surface || 'global'
    const reportId = makeReportId(kind, surface)
    const ok = await trackNow('feedback_moment', {
      schema: 'mentormind.feedback_hub.v1',
      source: launchContext?.surface ? 'local_report_button' : 'global_feedback_button',
      report_id: reportId,
      feedback_kind: kind,
      surface,
      interaction_id: launchContext?.interactionId || makeInteractionId(kind),
      severity,
      user_note: userNote.slice(0, FEEDBACK_TEXT_LIMIT),
      expected_behavior: expectedBehavior.slice(0, FEEDBACK_TEXT_LIMIT),
      context: getTelemetryContextSnapshot({
        ...(launchContext?.snapshot || {}),
        feedback_kind: kind,
        severity,
        report_surface: surface,
        report_id: reportId,
        has_user_note: userNote.length > 0,
        has_expected_behavior: expectedBehavior.length > 0,
      }),
    })
    setSubmitting(false)
    if (!ok) {
      setSubmittedReportId(reportId)
      setSubmittedMode('queued')
      setSubmitted(true)
      setMessage('')
      setExpected('')
      window.setTimeout(() => {
        setSubmitted(false)
        onClose()
      }, 4200)
      return
    }
    setSubmittedReportId(reportId)
    setSubmittedMode('recorded')
    setSubmitted(true)
    setMessage('')
    setExpected('')
    window.setTimeout(() => {
      setSubmitted(false)
      onClose()
    }, 2600)
  }

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={lang === 'zh' ? '快速反馈' : 'Quick feedback'}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <div className="text-base font-semibold text-gray-950">
              {lang === 'zh' ? '快速反馈' : 'Quick feedback'}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {lang === 'zh'
                ? '我们会自动带上页面、设备、最近错误和操作线索。'
                : 'We attach page, device, recent errors, and action breadcrumbs automatically.'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label={lang === 'zh' ? '关闭' : 'Close'}
          >
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-5 py-10 text-center">
            <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-full ${
              submittedMode === 'queued' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
            }`}>
              {submittedMode === 'queued' ? <AlertTriangle size={22} /> : <Check size={22} />}
            </div>
            <div className="text-sm font-semibold text-gray-900">
              {submittedMode === 'queued'
                ? (lang === 'zh'
                  ? '已暂存，会自动重试发送。'
                  : 'Saved locally and will retry automatically.')
                : (lang === 'zh'
                  ? '已记录，会和错误线索一起进入分析队列。'
                  : 'Recorded with the debugging context.')}
            </div>
            <div className="mt-1 max-w-sm text-xs leading-5 text-gray-500">
              {submittedMode === 'queued'
                ? (lang === 'zh'
                  ? '网络或服务短暂不可用时，这条反馈仍会留在本次浏览器会话里。'
                  : 'If the network or service is temporarily unavailable, this report stays in this browser session.')
                : (lang === 'zh'
                  ? '谢谢，这会帮助我们把测试反馈整理成可修复的问题。'
                  : 'Thanks. This helps turn tester feedback into fixable issues.')}
            </div>
            {submittedReportId && (
              <div className="mt-2 rounded-lg bg-gray-50 px-2 py-1 font-mono text-xs text-gray-500">
                {submittedReportId}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {KIND_OPTIONS.map((item) => {
                const Icon = item.icon
                const active = item.value === kind
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      setKind(item.value)
                      setSeverity(item.value === 'function' || item.value === 'general' ? 'idea' : 'confusing')
                    }}
                    className={`flex min-h-[78px] items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? 'border-blue-300 bg-blue-50 text-blue-950'
                        : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={18} className={active ? 'mt-0.5 text-blue-700' : 'mt-0.5 text-gray-500'} />
                    <span>
                      <span className="block text-sm font-semibold">{lang === 'zh' ? item.zh : item.en}</span>
                      <span className="mt-1 block text-xs leading-5 text-gray-500">{lang === 'zh' ? item.zhHint : item.enHint}</span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <AlertTriangle size={14} />
                {kind === 'bug'
                  ? (lang === 'zh' ? '问题类型' : 'Issue type')
                  : (lang === 'zh' ? '反馈类型' : 'Feedback tone')}
              </div>
              <div className="flex flex-wrap gap-2">
                {SEVERITIES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setSeverity(item.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      severity === item.value
                        ? 'border-blue-300 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {lang === 'zh' ? item.zh : item.en}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600">
              <span className="font-semibold text-gray-800">{lang === 'zh' ? selectedKind.zh : selectedKind.en}: </span>
              {lang === 'zh' ? selectedKind.zhHint : selectedKind.enHint}
            </div>

            <div className="space-y-1">
              <textarea
                value={message}
                onChange={(event) => {
                  setMessage(event.target.value.slice(0, FEEDBACK_TEXT_LIMIT))
                  if (submitError) setSubmitError(null)
                }}
                maxLength={FEEDBACK_TEXT_LIMIT}
                rows={4}
                placeholder={
                  lang === 'zh'
                    ? '直接说：哪里坏了、哪里不好用、哪里感觉不对，或者哪里做得好。可以很短。'
                    : 'Say what broke, what felt awkward, what felt bad, or what worked well. Short is fine.'
                }
                className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div className="text-right text-xs text-gray-400">
                {message.length}/{FEEDBACK_TEXT_LIMIT}
              </div>
            </div>

            <div className="space-y-1">
              <textarea
                value={expected}
                onChange={(event) => {
                  setExpected(event.target.value.slice(0, FEEDBACK_TEXT_LIMIT))
                  if (submitError) setSubmitError(null)
                }}
                maxLength={FEEDBACK_TEXT_LIMIT}
                rows={3}
                placeholder={lang === 'zh' ? '你希望它怎么做？可选' : 'What should have happened instead? Optional'}
                className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div className="text-right text-xs text-gray-400">
                {expected.length}/{FEEDBACK_TEXT_LIMIT}
              </div>
            </div>

            {submitError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {submitError}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                <Send size={16} />
                {submitting
                  ? (lang === 'zh' ? '发送中…' : 'Sending…')
                  : (lang === 'zh' ? '发送反馈' : 'Send feedback')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
