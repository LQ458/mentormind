'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Flag, Send, X } from 'lucide-react'
import { useLanguage } from './LanguageContext'
import { getTelemetryContextSnapshot, trackNow } from '../lib/telemetry'
import type { FeedbackSeverity } from './feedbackEvents'

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

function makeReportId(surface: string, interactionId: string): string {
  const safeSurface = surface.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 24) || 'moment'
  const safeInteraction = interactionId.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 18) || 'interaction'
  return `fm-${safeSurface}-${safeInteraction}-${Date.now().toString(36)}`
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

  const submit = async () => {
    if (submitting) return
    const trimmedNote = note.trim()
    const trimmedExpected = expected.trim()
    if (!trimmedNote && !trimmedExpected) {
      setError(lang === 'zh' ? '写一句也可以，方便我们复现。' : 'Add one short note so we can reproduce it.')
      return
    }
    setSubmitting(true)
    setError(null)
    const reportId = makeReportId(surface, interactionId)
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
      context: getTelemetryContextSnapshot({
        ...(snapshot || {}),
        report_id: reportId,
        feedback_kind: 'bug',
        severity,
        report_surface: surface,
        has_user_note: trimmedNote.length > 0,
        has_expected_behavior: trimmedExpected.length > 0,
      }),
    })
    setSubmitting(false)
    if (result === 'rejected') {
      setError(lang === 'zh' ? '这条反馈没有被服务器接受，请刷新页面后再试。' : 'This feedback was not accepted. Refresh and try again.')
      return
    }
    if (result === 'queued') {
      setSubmittedReportId(reportId)
      setSubmittedMode('queued')
      setSubmitted(true)
      setOpen(false)
      setNote('')
      setExpected('')
      window.setTimeout(() => setSubmitted(false), 4200)
      return
    }
    setSubmittedReportId(reportId)
    setSubmittedMode('recorded')
    setSubmitted(true)
    setOpen(false)
    setNote('')
    setExpected('')
    window.setTimeout(() => setSubmitted(false), 2600)
  }

  if (submitted) {
    const queued = submittedMode === 'queued'
    return (
      <div className={`inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium ${
        queued
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      }`}>
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
              onClick={() => setOpen(false)}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
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
