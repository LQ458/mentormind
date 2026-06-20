'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { X } from 'lucide-react'
import { useLanguage } from './LanguageContext'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { track, getOrCreateSessionId } from '../lib/telemetry'

const SURVEY_KEY = 'mm-survey-dismissed'
const PENDING_SURVEY_KEY = 'mm_pending_exit_surveys_v1'
const PENDING_SURVEY_LIMIT = 5
const PENDING_SURVEY_MAX_BYTES = 64 * 1024

// ---------- Option constants (values are stable backend keys) ----------

const EXAM_OPTIONS = [
  { value: 'gaokao', en: 'Gaokao', zh: '高考' },
  { value: 'ap', en: 'AP', zh: 'AP' },
  { value: 'a_level', en: 'A-Level', zh: 'A-Level' },
  { value: 'ib', en: 'IB', zh: 'IB' },
  { value: 'sat_act', en: 'SAT/ACT', zh: 'SAT/ACT' },
  { value: 'college', en: 'College / postgrad', zh: '大学 / 研究生' },
  { value: 'casual', en: 'Casual learning', zh: '随便学学' },
  { value: 'other', en: 'Other', zh: '其他' },
] as const

const SCHOOL_YEAR_OPTIONS = [
  { value: 'middle_school', en: 'Middle school', zh: '初中' },
  { value: 'high_school_freshman_sophomore', en: 'High school (9-10)', zh: '高一 / 高二' },
  { value: 'high_school_junior_senior', en: 'High school (11-12)', zh: '高三 / 高四' },
  { value: 'gap_or_repeat', en: 'Gap year / repeat', zh: '复读 / 间隔年' },
  { value: 'undergraduate', en: 'Undergraduate', zh: '本科生' },
  { value: 'postgraduate', en: 'Postgraduate', zh: '研究生' },
  { value: 'other', en: 'Other', zh: '其他' },
] as const

const PRIOR_TOOLS_OPTIONS = [
  { value: 'textbooks', en: 'Textbooks', zh: '教科书' },
  { value: 'youtube_bilibili', en: 'YouTube / Bilibili', zh: 'YouTube / B站' },
  { value: 'khan_academy', en: 'Khan Academy', zh: '可汗学院' },
  { value: 'cn_tutoring_apps', en: 'Xueersi / Yuanfudao / Zuoyebang', zh: '学而思 / 猿辅导 / 作业帮' },
  { value: 'one_on_one', en: '1-on-1 tutoring', zh: '一对一辅导' },
  { value: 'llm_chat', en: 'ChatGPT / DeepSeek / Claude', zh: 'ChatGPT / DeepSeek / Claude' },
  { value: 'past_papers', en: 'Past papers', zh: '历年真题' },
  { value: 'other', en: 'Other', zh: '其他' },
] as const

const LIKERT_QUESTIONS = [
  {
    key: 'plan_useful',
    en: 'I got a useful study plan within 2 minutes',
    zh: '我能在 2 分钟内拿到有用计划',
  },
  {
    key: 'lesson_clarity',
    en: 'AI answers matched my exact course or exam',
    zh: 'AI 回答贴合我的课程或考试',
  },
  {
    key: 'latency_ok',
    en: 'Waiting time did not interrupt my flow',
    zh: '等待时间没有打断我的学习',
  },
  {
    key: 'smooth',
    en: 'Board lessons opened and saved reliably',
    zh: '板书课能稳定打开并保存',
  },
  {
    key: 'return_next_week',
    en: 'I would choose this over my current main tool next week',
    zh: '下周我愿意优先用它替代现有工具',
  },
] as const

type LikertKey = typeof LIKERT_QUESTIONS[number]['key']

const SCALE_LABELS_EN = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree']
const SCALE_LABELS_ZH = ['非常不同意', '不同意', '中立', '同意', '非常同意']

const PMF_OPTIONS = [
  { value: 'very_disappointed', en: 'Very disappointed', zh: '非常失望' },
  { value: 'somewhat', en: 'Somewhat disappointed', zh: '有点失望' },
  { value: 'not', en: 'Not disappointed', zh: '不会失望' },
] as const

type PmfValue = typeof PMF_OPTIONS[number]['value']

const TRADEOFF_OPTIONS = [
  {
    key: 'speed_depth',
    en: ['Faster first answer', 'Deeper first answer'],
    zh: ['先快点回答', '先回答更深入'],
  },
  {
    key: 'guided_free',
    en: ['More guided steps', 'More free chat'],
    zh: ['更多引导步骤', '更多自由对话'],
  },
  {
    key: 'plan_board',
    en: ['Better study plans', 'Better board lessons'],
    zh: ['学习计划更好', '板书课更好'],
  },
] as const

type TradeoffKey = typeof TRADEOFF_OPTIONS[number]['key']

type ExitSurveyPayload = {
  exam: string
  school_year: string
  prior_tools: string[]
  likert: Partial<Record<LikertKey, number>>
  pmf_score: PmfValue | null
  nps: number | null
  pain_point: string
  feature_request: string
  other_feedback: string
  contact_email: string
  language: 'zh' | 'en'
  session_id: string
  partial: boolean
  submitted_at: string
  queued_at?: string
}

function surveyStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function isExitSurveyPayload(value: unknown): value is ExitSurveyPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Record<string, unknown>
  return (
    typeof payload.session_id === 'string' &&
    typeof payload.language === 'string' &&
    typeof payload.submitted_at === 'string' &&
    typeof payload.partial === 'boolean'
  )
}

function readPendingSurveyPayloads(): ExitSurveyPayload[] {
  const storage = surveyStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(PENDING_SURVEY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter(isExitSurveyPayload).slice(-PENDING_SURVEY_LIMIT)
      : []
  } catch {
    return []
  }
}

function writePendingSurveyPayloads(payloads: ExitSurveyPayload[]): void {
  const storage = surveyStorage()
  if (!storage) return
  try {
    let bounded = payloads.slice(-PENDING_SURVEY_LIMIT)
    let text = JSON.stringify(bounded)
    while (text.length > PENDING_SURVEY_MAX_BYTES && bounded.length > 0) {
      bounded = bounded.slice(1)
      text = JSON.stringify(bounded)
    }
    if (bounded.length === 0) {
      storage.removeItem(PENDING_SURVEY_KEY)
    } else {
      storage.setItem(PENDING_SURVEY_KEY, text)
    }
  } catch {
    // Feedback fallback storage should never interrupt the user.
  }
}

function surveyPayloadKey(payload: ExitSurveyPayload): string {
  return [
    payload.session_id,
    payload.partial ? 'partial' : 'complete',
    payload.pmf_score,
    payload.nps,
    payload.pain_point.slice(0, 120),
    payload.feature_request.slice(0, 80),
  ].join(':')
}

function queuePendingSurveyPayload(payload: ExitSurveyPayload): void {
  try {
    const key = surveyPayloadKey(payload)
    const pending = readPendingSurveyPayloads()
    const next = [
      ...pending.filter((item) => surveyPayloadKey(item) !== key),
      { ...payload, queued_at: new Date().toISOString() },
    ]
    writePendingSurveyPayloads(next)
  } catch {
    // Losing the fallback buffer is unfortunate, but must not block exit.
  }
}

async function submitSurveyPayload(payload: ExitSurveyPayload): Promise<boolean> {
  try {
    const res = await fetch('/api/backend/feedback/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => ({}))
    return data?.success !== false && data?.ok !== false && data?.recorded !== false
  } catch {
    return false
  }
}

async function flushPendingSurveyPayloads(): Promise<void> {
  const pending = readPendingSurveyPayloads()
  if (pending.length === 0) return

  const remaining: ExitSurveyPayload[] = []
  for (const payload of pending) {
    const sent = await submitSurveyPayload(payload)
    if (!sent) remaining.push(payload)
  }
  writePendingSurveyPayloads(remaining)
}

// ---------- Component ----------

interface ExitSurveyProps {
  open: boolean
  onClose: () => void
}

export default function ExitSurvey({ open, onClose }: ExitSurveyProps) {
  const { language } = useLanguage()
  const lang: 'zh' | 'en' = language === 'zh' ? 'zh' : 'en'
  const trapRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: onClose })
  const overlayRef = useRef<HTMLDivElement>(null)

  // Step state
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Page 1 — demographics
  const [exam, setExam] = useState<string | null>(null)
  const [schoolYear, setSchoolYear] = useState<string | null>(null)
  const [priorTools, setPriorTools] = useState<string[]>([])

  // Page 2 — quantitative
  const [likert, setLikert] = useState<Record<LikertKey, number | null>>({
    plan_useful: null,
    lesson_clarity: null,
    latency_ok: null,
    smooth: null,
    return_next_week: null,
  })
  const [pmf, setPmf] = useState<PmfValue | null>(null)
  const [nps, setNps] = useState<number | null>(null)
  const [tradeoffs, setTradeoffs] = useState<Record<TradeoffKey, string | null>>({
    speed_depth: null,
    guided_free: null,
    plan_board: null,
  })

  // Page 3 — open feedback
  const [painPoint, setPainPoint] = useState('')
  const [featureRequest, setFeatureRequest] = useState('')
  const [otherFeedback, setOtherFeedback] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  const [submitting, setSubmitting] = useState(false)

  const scaleLabels = lang === 'zh' ? SCALE_LABELS_ZH : SCALE_LABELS_EN

  useEffect(() => {
    if (!open) return
    void flushPendingSurveyPayloads().catch(() => {})
  }, [open])

  // ---- Validation ----
  const page1Valid = !!exam && !!schoolYear && priorTools.length >= 1
  const page2Valid = useMemo(() => {
    return (
      Object.values(likert).every((v) => typeof v === 'number') &&
      pmf !== null &&
      typeof nps === 'number' &&
      Object.values(tradeoffs).every((v) => typeof v === 'string')
    )
  }, [likert, pmf, nps, tradeoffs])
  const page3Valid = painPoint.trim().length >= 10

  // ---- Helpers ----
  const togglePriorTool = (val: string) => {
    setPriorTools((prev) =>
      prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val],
    )
  }

  const buildPayload = (partial: boolean) => {
    const likertPayload: Partial<Record<LikertKey, number>> = {}
    for (const question of LIKERT_QUESTIONS) {
      const value = likert[question.key]
      if (typeof value === 'number' && value >= 1 && value <= 5) {
        likertPayload[question.key] = value
      }
    }

    return {
      exam: exam ?? (partial ? 'other' : 'other'),
      school_year: schoolYear ?? (partial ? 'other' : 'other'),
      prior_tools: priorTools,
      likert: likertPayload,
      pmf_score: pmf,
      nps: typeof nps === 'number' ? nps : null,
      pain_point: painPoint.slice(0, 4000),
      feature_request: featureRequest.slice(0, 4000),
      other_feedback: [
        `tradeoffs=${JSON.stringify(tradeoffs)}`,
        otherFeedback.trim(),
      ].filter(Boolean).join('\n').slice(0, 4000),
      contact_email: contactEmail.trim().slice(0, 320),
      language: lang,
      session_id: getOrCreateSessionId(),
    }
  }

  const dismiss = () => {
    localStorage.setItem(SURVEY_KEY, '1')
    onClose()
  }

  const postPayload = async (partial: boolean) => {
    const payload: ExitSurveyPayload = {
      ...buildPayload(partial),
      partial,
      submitted_at: new Date().toISOString(),
    }
    void flushPendingSurveyPayloads().catch(() => {})
    const sent = await submitSurveyPayload(payload)
    if (!sent) {
      queuePendingSurveyPayload(payload)
    }
    // Backwards-compatible analytics event
    try {
      track('survey_response', {
        pmf: payload.pmf_score ?? 'unanswered',
        nps: payload.nps,
        partial,
        queued: !sent,
      })
    } catch {
      // ignore
    }
  }

  const handleSkip = async () => {
    setSubmitting(true)
    try {
      await postPayload(true)
    } finally {
      setSubmitting(false)
      dismiss()
    }
  }

  const handleSubmit = async () => {
    if (!page3Valid) return
    setSubmitting(true)
    try {
      await postPayload(false)
    } finally {
      setSubmitting(false)
      dismiss()
    }
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) dismiss()
  }

  if (!open) return null

  // ---- Step renderers ----

  const stepLabels = lang === 'zh'
    ? ['你的场景', '选择对比', '具体卡点']
    : ['Your context', 'Trade-offs', 'Blocking detail']

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
        aria-label={lang === 'zh' ? '你的反馈' : 'Your feedback'}
        style={{
          background: 'var(--surface, #fff)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 640,
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
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            padding: '20px 24px 12px',
            borderBottom: '1px solid var(--line, #e8ecf0)',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              {lang === 'zh' ? '帮我们找出最该修的地方' : 'Help us find what to fix first'}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {lang === 'zh' ? '约 5 分钟，尽量选具体答案' : 'About 5 minutes, concrete answers only'}
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

        {/* Progress bar */}
        <div style={{ padding: '14px 24px 4px' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background:
                    s <= step ? 'var(--accent, #6366f1)' : 'var(--line, #e8ecf0)',
                  transition: 'background 0.15s',
                }}
              />
            ))}
          </div>
          <div
            className="muted"
            style={{ fontSize: 11, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}
          >
            <span>
              {lang === 'zh' ? `第 ${step} 步 / 共 3 步` : `Step ${step} of 3`}
            </span>
            <span>{stepLabels[step - 1]}</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 24px 20px' }}>
          {step === 1 && (
            <Step1
              lang={lang}
              exam={exam}
              setExam={setExam}
              schoolYear={schoolYear}
              setSchoolYear={setSchoolYear}
              priorTools={priorTools}
              togglePriorTool={togglePriorTool}
            />
          )}
          {step === 2 && (
            <Step2
              lang={lang}
              scaleLabels={scaleLabels}
              likert={likert}
              setLikert={setLikert}
              pmf={pmf}
              setPmf={setPmf}
              nps={nps}
              setNps={setNps}
              tradeoffs={tradeoffs}
              setTradeoffs={setTradeoffs}
            />
          )}
          {step === 3 && (
            <Step3
              lang={lang}
              painPoint={painPoint}
              setPainPoint={setPainPoint}
              featureRequest={featureRequest}
              setFeatureRequest={setFeatureRequest}
              otherFeedback={otherFeedback}
              setOtherFeedback={setOtherFeedback}
              contactEmail={contactEmail}
              setContactEmail={setContactEmail}
            />
          )}
        </div>

        {/* Footer / actions */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 24px 20px',
            borderTop: '1px solid var(--line, #e8ecf0)',
            position: 'sticky',
            bottom: 0,
            background: 'var(--surface, #fff)',
          }}
        >
          <button
            type="button"
            onClick={handleSkip}
            className="btn btn-sm"
            disabled={submitting}
          >
            {lang === 'zh' ? '跳过' : 'Skip'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s === 3 ? 2 : 1) as 1 | 2 | 3)}
                className="btn btn-sm"
                disabled={submitting}
              >
                {lang === 'zh' ? '上一步' : 'Back'}
              </button>
            )}
            {step < 3 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s === 1 ? 2 : 3) as 1 | 2 | 3)}
                className="btn btn-sm btn-primary"
                disabled={
                  submitting ||
                  (step === 1 && !page1Valid) ||
                  (step === 2 && !page2Valid)
                }
              >
                {lang === 'zh' ? '下一步' : 'Next'}
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                onClick={handleSubmit}
                className="btn btn-sm btn-primary"
                disabled={submitting || !page3Valid}
              >
                {submitting
                  ? lang === 'zh' ? '提交中…' : 'Submitting…'
                  : lang === 'zh' ? '提交' : 'Submit'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export { SURVEY_KEY }

// ---------- Sub-step components ----------

function ChipButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        padding: '7px 12px',
        borderRadius: 999,
        border: selected
          ? '1.5px solid var(--accent, #6366f1)'
          : '1.5px solid var(--line, #e8ecf0)',
        background: selected ? 'var(--accent, #6366f1)' : 'var(--surface-2, #f5f7fa)',
        color: selected ? '#fff' : 'var(--ink, #111)',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background 0.12s, border-color 0.12s, color 0.12s',
      }}
    >
      {children}
    </button>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
      {children}
    </div>
  )
}

function Step1({
  lang,
  exam,
  setExam,
  schoolYear,
  setSchoolYear,
  priorTools,
  togglePriorTool,
}: {
  lang: 'zh' | 'en'
  exam: string | null
  setExam: (v: string) => void
  schoolYear: string | null
  setSchoolYear: (v: string) => void
  priorTools: string[]
  togglePriorTool: (v: string) => void
}) {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <FieldLabel>
          {lang === 'zh' ? '1. 你目前在准备什么考试？' : '1. What are you preparing for?'}
        </FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {EXAM_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.value}
              selected={exam === opt.value}
              onClick={() => setExam(opt.value)}
            >
              {lang === 'zh' ? opt.zh : opt.en}
            </ChipButton>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <FieldLabel>
          {lang === 'zh' ? '2. 你目前的年级？' : '2. Where are you in school?'}
        </FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SCHOOL_YEAR_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.value}
              selected={schoolYear === opt.value}
              onClick={() => setSchoolYear(opt.value)}
            >
              {lang === 'zh' ? opt.zh : opt.en}
            </ChipButton>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 4 }}>
        <FieldLabel>
          {lang === 'zh'
            ? '3. 用过哪些学习工具？（多选）'
            : '3. What learning tools have you used? (multi-select)'}
        </FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRIOR_TOOLS_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.value}
              selected={priorTools.includes(opt.value)}
              onClick={() => togglePriorTool(opt.value)}
            >
              {lang === 'zh' ? opt.zh : opt.en}
            </ChipButton>
          ))}
        </div>
      </div>
    </div>
  )
}

function Step2({
  lang,
  scaleLabels,
  likert,
  setLikert,
  pmf,
  setPmf,
  nps,
  setNps,
  tradeoffs,
  setTradeoffs,
}: {
  lang: 'zh' | 'en'
  scaleLabels: string[]
  likert: Record<LikertKey, number | null>
  setLikert: React.Dispatch<React.SetStateAction<Record<LikertKey, number | null>>>
  pmf: PmfValue | null
  setPmf: (v: PmfValue) => void
  nps: number | null
  setNps: (n: number) => void
  tradeoffs: Record<TradeoffKey, string | null>
  setTradeoffs: React.Dispatch<React.SetStateAction<Record<TradeoffKey, string | null>>>
}) {
  return (
    <div>
      {/* Likert */}
      <div style={{ marginBottom: 22 }}>
        <FieldLabel>
          {lang === 'zh' ? '4-8. 按今天真实体验评分' : '4-8. Rate today’s actual experience'}
        </FieldLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr repeat(5, 40px)',
            gap: 4,
            marginBottom: 8,
            alignItems: 'center',
          }}
        >
          <div />
          {scaleLabels.map((_, i) => (
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
        {LIKERT_QUESTIONS.map((q, rowIdx) => {
          const value = likert[q.key]
          return (
            <div
              key={q.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr repeat(5, 40px)',
                gap: 4,
                alignItems: 'center',
                padding: '8px 0',
                borderBottom:
                  rowIdx < LIKERT_QUESTIONS.length - 1
                    ? '1px solid var(--line, #e8ecf0)'
                    : 'none',
              }}
            >
              <div style={{ fontSize: 13, paddingRight: 8 }}>
                {lang === 'zh' ? q.zh : q.en}
              </div>
              {[1, 2, 3, 4, 5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() =>
                    setLikert((prev) => ({ ...prev, [q.key]: val }))
                  }
                  aria-label={`${val} — ${scaleLabels[val - 1]}`}
                  aria-pressed={value === val}
                  style={{
                    width: 32,
                    height: 32,
                    margin: '0 auto',
                    borderRadius: '50%',
                    border:
                      value === val
                        ? '2px solid var(--accent, #6366f1)'
                        : '2px solid var(--line, #e8ecf0)',
                    background:
                      value === val
                        ? 'var(--accent, #6366f1)'
                        : 'var(--surface-2, #f5f7fa)',
                    color: value === val ? '#fff' : 'var(--ink-muted)',
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
          )
        })}
      </div>

      <div style={{ marginBottom: 22 }}>
        <FieldLabel>
          {lang === 'zh'
            ? '9-11. 两个只能先做好一个，你选哪个？'
            : '9-11. If we can improve only one first, pick the winner'}
        </FieldLabel>
        <div style={{ display: 'grid', gap: 8 }}>
          {TRADEOFF_OPTIONS.map((item) => {
            const labels = lang === 'zh' ? item.zh : item.en
            return (
              <div
                key={item.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                }}
              >
                {labels.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setTradeoffs((prev) => ({ ...prev, [item.key]: label }))}
                    aria-pressed={tradeoffs[item.key] === label}
                    style={{
                      borderRadius: 8,
                      border:
                        tradeoffs[item.key] === label
                          ? '2px solid var(--accent, #6366f1)'
                          : '1.5px solid var(--line, #e8ecf0)',
                      background:
                        tradeoffs[item.key] === label
                          ? 'rgba(99, 102, 241, 0.10)'
                          : 'var(--surface-2, #f5f7fa)',
                      color: 'var(--ink, #111)',
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '10px 8px',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* PMF */}
      <div style={{ marginBottom: 22 }}>
        <FieldLabel>
          {lang === 'zh'
            ? '12. 如果明天不能用了，你会有多失望？'
            : '12. If MentorMind disappeared tomorrow, how disappointed would you be?'}
        </FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PMF_OPTIONS.map((opt) => (
            <ChipButton
              key={opt.value}
              selected={pmf === opt.value}
              onClick={() => setPmf(opt.value)}
            >
              {lang === 'zh' ? opt.zh : opt.en}
            </ChipButton>
          ))}
        </div>
      </div>

      {/* NPS */}
      <div style={{ marginBottom: 4 }}>
        <FieldLabel>
          {lang === 'zh'
            ? '13. 你会推荐给同学或朋友吗？（0-10）'
            : '13. Would you recommend it to a classmate or friend? (0-10)'}
        </FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {Array.from({ length: 11 }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setNps(i)}
              aria-pressed={nps === i}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border:
                  nps === i
                    ? '2px solid var(--accent, #6366f1)'
                    : '1.5px solid var(--line, #e8ecf0)',
                background:
                  nps === i ? 'var(--accent, #6366f1)' : 'var(--surface-2, #f5f7fa)',
                color: nps === i ? '#fff' : 'var(--ink, #111)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
            >
              {i}
            </button>
          ))}
        </div>
        <div
          className="muted"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
          }}
        >
          <span>{lang === 'zh' ? '完全不会' : 'Not at all'}</span>
          <span>{lang === 'zh' ? '一定会' : 'Definitely'}</span>
        </div>
      </div>
    </div>
  )
}

function Step3({
  lang,
  painPoint,
  setPainPoint,
  featureRequest,
  setFeatureRequest,
  otherFeedback,
  setOtherFeedback,
  contactEmail,
  setContactEmail,
}: {
  lang: 'zh' | 'en'
  painPoint: string
  setPainPoint: (v: string) => void
  featureRequest: string
  setFeatureRequest: (v: string) => void
  otherFeedback: string
  setOtherFeedback: (v: string) => void
  contactEmail: string
  setContactEmail: (v: string) => void
}) {
  return (
    <div>
      <Textarea
        id="survey-pain"
        label={
          lang === 'zh'
            ? '14. 哪一步差点让你放弃？写具体位置和发生了什么（必填）'
            : '14. What almost made you quit? Name the exact step and what happened (required)'
        }
        value={painPoint}
        onChange={setPainPoint}
        placeholder={
          lang === 'zh'
            ? '例：学习计划第 2 步，点“5分”后等了很久，最后没有生成计划。'
            : 'Example: Study plan step 2, clicked “5”, waited a long time, plan never generated.'
        }
        rows={3}
        required
      />
      <Textarea
        id="survey-feature"
        label={
          lang === 'zh'
            ? '15. 哪个改动会让你明天还想打开？'
            : '15. What one change would make you open it again tomorrow?'
        }
        value={featureRequest}
        onChange={setFeatureRequest}
        placeholder={
          lang === 'zh'
            ? '例：生成前显示进度；学习计划能一键改成 4 周冲刺。'
            : 'Example: show progress while generating; turn a plan into a 4-week sprint.'
        }
        rows={3}
      />
      <Textarea
        id="survey-other"
        label={
          lang === 'zh' ? '16. 你现在主要用什么替代它？' : '16. What do you mainly use instead right now?'
        }
        value={otherFeedback}
        onChange={setOtherFeedback}
        placeholder={
          lang === 'zh'
            ? '例：DeepSeek + 真题；B站课程；学校老师发的资料。'
            : 'Example: DeepSeek + past papers; YouTube; teacher handouts.'
        }
        rows={2}
      />

      <div style={{ marginBottom: 4 }}>
        <label
          htmlFor="survey-email"
          style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}
        >
          {lang === 'zh'
            ? '17. 邮箱（如果可以追问细节）'
            : '17. Email (if we can ask one follow-up)'}
        </label>
        <input
          id="survey-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value.slice(0, 320))}
          placeholder={lang === 'zh' ? '（可选）' : '(optional)'}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--line, #e8ecf0)',
            background: 'var(--surface-2, #f5f7fa)',
            fontSize: 13,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  )
}

function Textarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows,
  required,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  required?: boolean
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        htmlFor={id}
        style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--accent, #6366f1)', marginLeft: 4 }}>*</span>
        )}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 4000))}
        placeholder={placeholder}
        rows={rows ?? 3}
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
      <div className="muted" style={{ fontSize: 11, textAlign: 'right', marginTop: 2 }}>
        {value.length}/4000
      </div>
    </div>
  )
}
