'use client'

import { useState } from 'react'
import { Check, Flag, Send, X } from 'lucide-react'
import { useLanguage } from './LanguageContext'
import { getTelemetryContextSnapshot, trackNow } from '../lib/telemetry'

type Severity = 'confusing' | 'blocked' | 'wrong' | 'slow' | 'visual'

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
]

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
    const ok = await trackNow('feedback_moment', {
      schema: 'mentormind.feedback_moment.v1',
      source: 'inline_feedback_moment',
      surface,
      interaction_id: interactionId,
      feedback_kind: 'bug',
      severity,
      user_note: trimmedNote.slice(0, 1200),
      expected_behavior: trimmedExpected.slice(0, 1200),
      context: getTelemetryContextSnapshot(snapshot),
    })
    setSubmitting(false)
    if (!ok) {
      setError(lang === 'zh' ? '暂时没记录成功，请再试一次。' : 'Could not record it yet. Please try again.')
      return
    }
    setSubmitted(true)
    setOpen(false)
    setNote('')
    setExpected('')
    window.setTimeout(() => setSubmitted(false), 2600)
  }

  if (submitted) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        <Check size={13} />
        {lang === 'zh' ? '已标记，后续可转成修复任务' : 'Marked for triage'}
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
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder={lang === 'zh' ? '例如：Mina只讲了答案，没有让我回应。' : 'Example: Mina explained but never asked me to respond.'}
            className="mb-2 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 leading-5 outline-none focus:ring-2 focus:ring-blue-400"
          />
          <textarea
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
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
