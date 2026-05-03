'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useLanguage } from './LanguageContext'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { track } from '../lib/telemetry'

const SURVEY_KEY = 'mm-survey-dismissed'

const LIKERT_ITEMS_EN = [
  'The platform helped me learn',
  'The AI explanations were clear',
  'The pace felt right',
  'I would recommend this to a friend',
  'The platform was responsive and felt fast',
]
const LIKERT_ITEMS_ZH = [
  '平台帮助我学习了知识',
  'AI 讲解清晰易懂',
  '学习节奏合适',
  '我会推荐给朋友',
  '平台流畅、不卡顿',
]

const SCALE_LABELS_EN = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']
const SCALE_LABELS_ZH = ['非常不同意', '不同意', '中立', '同意', '非常同意']

interface ExitSurveyProps {
  open: boolean
  onClose: () => void
}

export default function ExitSurvey({ open, onClose }: ExitSurveyProps) {
  const { language } = useLanguage()
  const lang: 'zh' | 'en' = language === 'zh' ? 'zh' : 'en'
  const trapRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: onClose })
  const overlayRef = useRef<HTMLDivElement>(null)

  const [ratings, setRatings] = useState<(number | null)[]>([null, null, null, null, null])
  const [freeText, setFreeText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const items = lang === 'zh' ? LIKERT_ITEMS_ZH : LIKERT_ITEMS_EN
  const scaleLabels = lang === 'zh' ? SCALE_LABELS_ZH : SCALE_LABELS_EN

  const dismiss = () => {
    localStorage.setItem(SURVEY_KEY, '1')
    onClose()
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      track('survey_response', {
        likert: ratings.map((r) => r ?? 0),
        freeText: freeText.slice(0, 4000),
        language: lang,
      })
    } catch {
      // best-effort — don't block dismiss on error
    } finally {
      setSubmitting(false)
      dismiss()
    }
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) dismiss()
  }

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: 16,
      }}
    >
      <div
        ref={trapRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={lang === 'zh' ? '用户反馈' : 'User feedback'}
        style={{
          background: 'var(--surface, #fff)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          outline: 'none',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--line, #e8ecf0)',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {lang === 'zh' ? '快速反馈' : 'Quick feedback'}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {lang === 'zh' ? '帮助我们改进 MentorMind（约 1 分钟）' : 'Help us improve MentorMind (~1 min)'}
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={lang === 'zh' ? '关闭' : 'Close'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 8,
              color: 'var(--ink-muted)',
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* Likert scale */}
          <div style={{ marginBottom: 24 }}>
            {/* Scale header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr repeat(5, 44px)',
                gap: 4,
                marginBottom: 8,
                alignItems: 'center',
              }}
            >
              <div />
              {scaleLabels.map((label, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 10,
                    color: 'var(--ink-muted)',
                    textAlign: 'center',
                    lineHeight: 1.2,
                  }}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            {items.map((item, rowIdx) => (
              <div
                key={rowIdx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr repeat(5, 44px)',
                  gap: 4,
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: rowIdx < items.length - 1 ? '1px solid var(--line, #e8ecf0)' : 'none',
                }}
              >
                <div style={{ fontSize: 13, paddingRight: 8 }}>{item}</div>
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      const next = [...ratings]
                      next[rowIdx] = val
                      setRatings(next)
                    }}
                    aria-label={`${val} — ${scaleLabels[val - 1]}`}
                    aria-pressed={ratings[rowIdx] === val}
                    style={{
                      width: 36,
                      height: 36,
                      margin: '0 auto',
                      borderRadius: '50%',
                      border: ratings[rowIdx] === val
                        ? '2px solid var(--accent, #6366f1)'
                        : '2px solid var(--line, #e8ecf0)',
                      background: ratings[rowIdx] === val
                        ? 'var(--accent, #6366f1)'
                        : 'var(--surface-2, #f5f7fa)',
                      color: ratings[rowIdx] === val ? '#fff' : 'var(--ink-muted)',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    {val}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Free text */}
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="survey-freetext"
              style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}
            >
              {lang === 'zh' ? '你希望改进什么？' : 'What would you change?'}
            </label>
            <textarea
              id="survey-freetext"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value.slice(0, 4000))}
              placeholder={lang === 'zh' ? '（可选）' : '(optional)'}
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid var(--line, #e8ecf0)',
                background: 'var(--surface-2, #f5f7fa)',
                fontSize: 13,
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <div
              className="muted"
              style={{ fontSize: 11, textAlign: 'right', marginTop: 2 }}
            >
              {freeText.length}/4000
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={dismiss}
              className="btn btn-sm"
              disabled={submitting}
            >
              {lang === 'zh' ? '跳过' : 'Skip'}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="btn btn-sm btn-primary"
              disabled={submitting}
            >
              {submitting
                ? lang === 'zh' ? '提交中…' : 'Submitting…'
                : lang === 'zh' ? '提交' : 'Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { SURVEY_KEY }
