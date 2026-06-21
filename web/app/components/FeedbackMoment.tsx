'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Copy, Flag, Send, X } from 'lucide-react'
import { useLanguage } from './LanguageContext'
import { getTelemetryContextSnapshot, trackNow } from '../lib/telemetry'
import type { FeedbackSeverity } from './feedbackEvents'
import { feedbackReceiptContextLines } from './feedbackReceipt'

type Severity = Exclude<FeedbackSeverity, 'idea'>

interface FeedbackMomentProps {
  surface: string
  interactionId: string
  snapshot?: Record<string, unknown>
}

const SEVERITIES: Array<{ value: Severity; en: string; zh: string }> = [
  { value: 'confusing', en: 'Confusing', zh: '看不懂' },
  { value: 'blocked', en: 'Blocked', zh: '卡住了' },
  { value: 'wrong', en: 'Wrong', zh: '内容不对' },
  { value: 'slow', en: 'Slow', zh: '太慢' },
  { value: 'visual', en: 'Visual', zh: '界面问题' },
  { value: 'quality', en: 'Quality', zh: '质量不够' },
]

const FEEDBACK_TEXT_LIMIT = 1200
type SubmissionMode = 'recorded' | 'queued'
type CopyState = 'idle' | 'copied' | 'failed'

function makeReportId(surface: string, interactionId: string): string {
  const safeSurface = surface.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 24) || 'moment'
  const safeInteraction = interactionId.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 18) || 'interaction'
  return `fm-${safeSurface}-${safeInteraction}-${Date.now().toString(36)}`
}

async function copyText(value: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // Fall back to a selectable textarea below.
    }
  }
  if (typeof document === 'undefined') return false
  let textarea: HTMLTextAreaElement | null = null
  try {
    textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.left = '0'
    textarea.style.top = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea?.remove()
  }
}

export function FeedbackMoment({ surface, interactionId, snapshot }: FeedbackMomentProps) {
  const { language } = useLanguage()
  const lang = language === 'zh' ? 'zh' : 'en'
  const [open, setOpen] = useState(false)
  const [severity, setSeverity] = useState<Severity>('confusing')
  const [note, setNote] = useState('')
  const [expected, setExpected] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null)
  const [submittedMode, setSubmittedMode] = useState<SubmissionMode | null>(null)
  const [submittedSummary, setSubmittedSummary] = useState<string | null>(null)
  const [reportIdCopyState, setReportIdCopyState] = useState<CopyState>('idle')
  const [summaryCopyState, setSummaryCopyState] = useState<CopyState>('idle')
  const [receiptOpen, setReceiptOpen] = useState(false)
  const hasDraft = note.trim().length > 0 || expected.trim().length > 0
  const copyFailed = reportIdCopyState === 'failed' || summaryCopyState === 'failed'
  const receiptVisible = receiptOpen || copyFailed

  const requestClose = () => {
    if (submitting) return
    if (hasDraft) {
      const confirmed = window.confirm(
        lang === 'zh'
          ? '这条反馈还没记录，确定关闭吗？'
          : 'This feedback has not been recorded yet. Close anyway?',
      )
      if (!confirmed) return
    }
    setOpen(false)
  }

  const makeSubmittedSummary = (
    mode: SubmissionMode,
    reportId: string,
    userNote: string,
    expectedBehavior: string,
    context: Record<string, unknown>,
  ): string => {
    const severityLabel = SEVERITIES.find((item) => item.value === severity)
    const page = typeof window === 'undefined' ? '' : window.location.pathname
    const adminUrl = typeof window === 'undefined'
      ? ''
      : `${window.location.origin}/admin/feedback?report=${encodeURIComponent(reportId)}`
    return [
      lang === 'zh' ? 'MentorMind 时刻反馈' : 'MentorMind moment feedback',
      `ID: ${reportId}`,
      adminUrl ? `${lang === 'zh' ? '后台检索' : 'Admin lookup'}: ${adminUrl}` : '',
      `${lang === 'zh' ? '状态' : 'Status'}: ${mode === 'queued'
        ? (lang === 'zh' ? '已暂存待重试' : 'Queued for retry')
        : (lang === 'zh' ? '已记录' : 'Recorded')}`,
      `${lang === 'zh' ? '位置' : 'Surface'}: ${surface}`,
      page ? `${lang === 'zh' ? '页面' : 'Page'}: ${page}` : '',
      ...feedbackReceiptContextLines(context, lang),
      `${lang === 'zh' ? '严重度' : 'Severity'}: ${severityLabel ? (lang === 'zh' ? severityLabel.zh : severityLabel.en) : severity}`,
      userNote ? `${lang === 'zh' ? '反馈' : 'Note'}: ${userNote}` : '',
      expectedBehavior ? `${lang === 'zh' ? '期望' : 'Expected'}: ${expectedBehavior}` : '',
    ].filter(Boolean).join('\n')
  }

  const copyReportId = async () => {
    if (!submittedReportId) return
    const ok = await copyText(submittedReportId)
    setReportIdCopyState(ok ? 'copied' : 'failed')
    if (!ok) setReceiptOpen(true)
    window.setTimeout(() => setReportIdCopyState('idle'), ok ? 1400 : 2200)
  }

  const copySubmittedSummary = async () => {
    if (!submittedSummary) return
    const ok = await copyText(submittedSummary)
    setSummaryCopyState(ok ? 'copied' : 'failed')
    if (!ok) setReceiptOpen(true)
    window.setTimeout(() => setSummaryCopyState('idle'), ok ? 1400 : 2200)
  }

  const submit = async () => {
    if (submitting) return
    const trimmedNote = note.trim()
    const trimmedExpected = expected.trim()
    const reportId = makeReportId(surface, interactionId)
    const context = getTelemetryContextSnapshot({
      ...(snapshot || {}),
      report_id: reportId,
      feedback_kind: 'bug',
      severity,
      report_surface: surface,
      has_user_note: trimmedNote.length > 0,
      has_expected_behavior: trimmedExpected.length > 0,
    })
    const hasErrorContext = Array.isArray(context.recent_errors) && context.recent_errors.length > 0
    if (!trimmedNote && !trimmedExpected && !hasErrorContext) {
      setError(lang === 'zh' ? '写一句也可以，方便我们复现。' : 'Add one short note so we can reproduce it.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await trackNow('feedback_moment', {
      schema: 'mentormind.feedback_moment.v1',
      source: 'inline_feedback_moment',
      surface,
      interaction_id: interactionId,
      report_id: reportId,
      feedback_kind: 'bug',
      severity,
      user_note: trimmedNote.slice(0, FEEDBACK_TEXT_LIMIT),
      expected_behavior: trimmedExpected.slice(0, FEEDBACK_TEXT_LIMIT),
      context,
    })
    setSubmitting(false)
    if (result === 'rejected') {
      setError(lang === 'zh' ? '这条反馈没有被服务器接受，请刷新页面后再试。' : 'This feedback was not accepted. Refresh and try again.')
      return
    }
    if (result === 'queued') {
      setSubmittedReportId(reportId)
      setSubmittedMode('queued')
      setSubmittedSummary(makeSubmittedSummary('queued', reportId, trimmedNote, trimmedExpected, context))
      setReportIdCopyState('idle')
      setSummaryCopyState('idle')
      setReceiptOpen(false)
      setSubmitted(true)
      setOpen(false)
      setNote('')
      setExpected('')
      return
    }
    setSubmittedReportId(reportId)
    setSubmittedMode('recorded')
    setSubmittedSummary(makeSubmittedSummary('recorded', reportId, trimmedNote, trimmedExpected, context))
    setReportIdCopyState('idle')
    setSummaryCopyState('idle')
    setReceiptOpen(false)
    setSubmitted(true)
    setOpen(false)
    setNote('')
    setExpected('')
  }

  if (submitted) {
    const queued = submittedMode === 'queued'
    return (
      <div className={`inline-flex max-w-full flex-col items-stretch gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
        queued
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      }`}>
        <div className="flex max-w-full flex-wrap items-center gap-1.5">
          {queued ? <AlertTriangle size={13} /> : <Check size={13} />}
          <span>
            {queued
              ? (lang === 'zh' ? '已暂存，会自动重试' : 'Saved locally; will retry')
              : (lang === 'zh' ? '已标记，后续可转成修复任务' : 'Marked for triage')}
          </span>
          {submittedReportId && (
            <span
              className={`max-w-[11rem] truncate font-mono text-[11px] ${queued ? 'text-amber-700' : 'text-emerald-600'}`}
              title={submittedReportId}
            >
              {submittedReportId}
            </span>
          )}
          <button
            type="button"
            onClick={copyReportId}
            className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-current/20 bg-white/60 px-2 font-semibold hover:bg-white"
          >
            <Copy size={12} />
            {reportIdCopyState === 'copied'
              ? (lang === 'zh' ? '已复制' : 'Copied')
              : reportIdCopyState === 'failed'
                ? (lang === 'zh' ? '失败' : 'Failed')
                : (lang === 'zh' ? '编号' : 'ID')}
          </button>
          <button
            type="button"
            onClick={copySubmittedSummary}
            className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-current/20 bg-white/60 px-2 font-semibold hover:bg-white"
          >
            <Copy size={12} />
            {summaryCopyState === 'copied'
              ? (lang === 'zh' ? '已复制' : 'Copied')
              : summaryCopyState === 'failed'
                ? (lang === 'zh' ? '失败' : 'Failed')
                : (lang === 'zh' ? '摘要' : 'Summary')}
          </button>
          {submittedSummary && (
            <button
              type="button"
              onClick={() => setReceiptOpen((value) => !value)}
              aria-expanded={receiptVisible}
              className="inline-flex h-7 items-center justify-center rounded-md border border-current/20 bg-white/60 px-2 font-semibold hover:bg-white"
            >
              {receiptVisible ? (lang === 'zh' ? '隐藏' : 'Hide') : (lang === 'zh' ? '回执' : 'Receipt')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-current/20 bg-white/60 hover:bg-white"
            aria-label={lang === 'zh' ? '关闭反馈回执' : 'Dismiss feedback receipt'}
          >
            <X size={12} />
          </button>
        </div>
        {submittedSummary && receiptVisible && (
          <div className="space-y-1">
            {copyFailed && (
              <div className={queued ? 'text-amber-700' : 'text-emerald-700'}>
                {lang === 'zh'
                  ? '复制失败时，可以点下面摘要框手动选择复制。'
                  : 'If copy failed, tap the receipt below and copy it manually.'}
              </div>
            )}
            <textarea
              readOnly
              value={submittedSummary}
              aria-label={lang === 'zh' ? '反馈回执摘要' : 'Feedback receipt summary'}
              className={`min-h-[96px] w-full min-w-[16rem] resize-none rounded-md border px-2 py-1.5 font-mono text-[11px] leading-5 ${
                queued
                  ? 'border-amber-200 bg-white/70 text-amber-900'
                  : 'border-emerald-200 bg-white/70 text-emerald-900'
              }`}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="text-xs">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 font-medium text-gray-500 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800"
        >
          <Flag size={13} />
          {lang === 'zh' ? '标记这一刻' : 'Mark this moment'}
        </button>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-semibold text-gray-800">
              {lang === 'zh' ? '哪里不对？' : 'What felt wrong?'}
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              disabled={submitting}
              aria-label={lang === 'zh' ? '关闭' : 'Close'}
            >
              <X size={14} />
            </button>
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SEVERITIES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setSeverity(item.value)}
                className={`rounded-full border px-2.5 py-1 font-medium ${
                  severity === item.value
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {lang === 'zh' ? item.zh : item.en}
              </button>
            ))}
          </div>
          <textarea
            aria-label={lang === 'zh' ? '反馈内容' : 'Feedback details'}
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, FEEDBACK_TEXT_LIMIT))}
            maxLength={FEEDBACK_TEXT_LIMIT}
            rows={2}
            placeholder={lang === 'zh' ? '例如：Mina只讲了答案，没有让我回应。' : 'Example: Mina explained but never asked me to respond.'}
            className="mb-2 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 leading-5 outline-none focus:ring-2 focus:ring-blue-400"
          />
          <textarea
            aria-label={lang === 'zh' ? '期望结果' : 'Expected outcome'}
            value={expected}
            onChange={(event) => setExpected(event.target.value.slice(0, FEEDBACK_TEXT_LIMIT))}
            maxLength={FEEDBACK_TEXT_LIMIT}
            rows={2}
            placeholder={lang === 'zh' ? '你期待它怎么做？可选' : 'What should it have done instead? Optional'}
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 leading-5 outline-none focus:ring-2 focus:ring-blue-400"
          />
          {error && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-800">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="mt-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 font-semibold text-white hover:bg-blue-700"
          >
            <Send size={13} />
            {submitting ? (lang === 'zh' ? '记录中…' : 'Recording…') : (lang === 'zh' ? '记录' : 'Record')}
          </button>
        </div>
      )}
    </div>
  )
}
