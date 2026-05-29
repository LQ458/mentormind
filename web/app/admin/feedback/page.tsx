'use client'

import { useEffect, useState, useMemo, Fragment } from 'react'
import { useLanguage } from '../../components/LanguageContext'
import { PageHead, Section, Progress } from '../../components/design/primitives'

// ---------- Types ----------

interface FeedbackRow {
  id: string
  created_at: string
  exam: string
  school_year: string
  prior_tools: string[]
  language: string
  pmf_score: string
  nps: number | null
  likert: Record<string, number>
  pain_point: string
  feature_request: string
  other_feedback: string
  contact_email: string
  derived_session_minutes?: number | null
  derived_board_lessons?: number | null
}

interface FeedbackListResponse {
  rows?: FeedbackRow[]
  total?: number
  // Allow pass-through error shapes
  error?: string
}

interface AggregateResponse {
  total?: number
  pmf_distribution?: Record<string, number>
  pmf_pct_very_disappointed?: number
  nps_score?: number
  nps_distribution?: Record<string, number>
  likert_means?: Record<string, number>
  exam_distribution?: Record<string, number>
  school_year_distribution?: Record<string, number>
  language_distribution?: Record<string, number>
  error?: string
}

// ---------- Helpers ----------

const LIKERT_LABELS: Record<string, { en: string; zh: string }> = {
  plan_useful: { en: 'Plan useful', zh: '计划有用' },
  lesson_clarity: { en: 'Lesson clarity', zh: '讲解清晰' },
  latency_ok: { en: 'Latency OK', zh: '响应速度' },
  smooth: { en: 'Smooth', zh: '流畅度' },
  return_next_week: { en: 'Return next week', zh: '下周再来' },
}

const PMF_LABELS: Record<string, { en: string; zh: string }> = {
  very_disappointed: { en: 'Very disappointed', zh: '非常失望' },
  somewhat: { en: 'Somewhat disappointed', zh: '有点失望' },
  not: { en: 'Not disappointed', zh: '不会失望' },
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(rows: FeedbackRow[]) {
  const headers = [
    'id', 'created_at', 'exam', 'school_year', 'language', 'pmf_score', 'nps',
    'plan_useful', 'lesson_clarity', 'latency_ok', 'smooth', 'return_next_week',
    'prior_tools', 'pain_point', 'feature_request', 'other_feedback', 'contact_email',
    'derived_session_minutes', 'derived_board_lessons',
  ]
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push([
      r.id, r.created_at, r.exam, r.school_year, r.language, r.pmf_score, r.nps ?? '',
      r.likert?.plan_useful ?? '', r.likert?.lesson_clarity ?? '', r.likert?.latency_ok ?? '',
      r.likert?.smooth ?? '', r.likert?.return_next_week ?? '',
      (r.prior_tools || []).join('|'),
      r.pain_point, r.feature_request, r.other_feedback, r.contact_email,
      r.derived_session_minutes ?? '', r.derived_board_lessons ?? '',
    ].map(csvEscape).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mm-feedback-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ---------- Page ----------

export default function AdminFeedbackPage() {
  const { language } = useLanguage()
  const lang: 'zh' | 'en' = language === 'zh' ? 'zh' : 'en'

  const [aggregate, setAggregate] = useState<AggregateResponse | null>(null)
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusCode, setStatusCode] = useState<number | null>(null)

  // Filters
  const [examFilter, setExamFilter] = useState<string>('')
  const [pmfFilter, setPmfFilter] = useState<string>('')
  const [langFilter, setLangFilter] = useState<string>('')

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    setStatusCode(null)
    try {
      const params = new URLSearchParams()
      params.set('limit', '50')
      params.set('offset', '0')
      if (examFilter) params.set('exam', examFilter)
      if (pmfFilter) params.set('pmf_score', pmfFilter)
      if (langFilter) params.set('language', langFilter)

      const [aggRes, listRes] = await Promise.all([
        fetch('/api/backend/admin/feedback/aggregate'),
        fetch(`/api/backend/admin/feedback?${params.toString()}`),
      ])

      if (!listRes.ok) {
        setStatusCode(listRes.status)
        const data = (await listRes.json().catch(() => ({}))) as { error?: string; detail?: string }
        if (listRes.status === 401 || listRes.status === 403) {
          setError(lang === 'zh' ? '需要管理员权限' : 'Sign in required (admin only)')
        } else {
          setError(data.error || data.detail || `HTTP ${listRes.status}`)
        }
        setAggregate(null)
        setRows([])
        return
      }

      const aggData = (await aggRes.json().catch(() => ({}))) as AggregateResponse
      const listData = (await listRes.json().catch(() => ({}))) as FeedbackListResponse

      setAggregate(aggData)
      setRows(listData.rows || [])
    } catch (err) {
      console.error('[admin feedback] fetch failed:', err)
      setError(lang === 'zh' ? '加载失败' : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examFilter, pmfFilter, langFilter])

  const examOptions = useMemo(() => {
    const seen = new Set<string>()
    rows.forEach((r) => seen.add(r.exam))
    Object.keys(aggregate?.exam_distribution || {}).forEach((k) => seen.add(k))
    return Array.from(seen).filter(Boolean).sort()
  }, [rows, aggregate])

  const formatDate = (s: string) => {
    try {
      return new Date(s).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    } catch {
      return s
    }
  }

  const likertMax = 5

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHead
        eyebrow={lang === 'zh' ? '管理' : 'Admin'}
        title={lang === 'zh' ? '用户反馈' : 'User feedback'}
        kicker={lang === 'zh' ? '原始问卷数据 + 聚合指标' : 'Raw survey responses + aggregates'}
      />

      {/* Loading / error states */}
      {loading && (
        <div className="muted" style={{ padding: 24 }}>
          {lang === 'zh' ? '加载中…' : 'Loading…'}
        </div>
      )}

      {!loading && error && (
        <div
          style={{
            padding: 16,
            border: '1px solid var(--line, #e8ecf0)',
            borderRadius: 12,
            background: 'var(--surface-2, #f5f7fa)',
            color: 'var(--ink-muted)',
            fontSize: 13,
          }}
        >
          {error}
          {statusCode != null && <span style={{ marginLeft: 8 }}>(HTTP {statusCode})</span>}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ---- Aggregates ---- */}
          <Section title={lang === 'zh' ? '汇总指标' : 'Aggregate metrics'}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              <KpiCard
                label={lang === 'zh' ? '总样本数' : 'Total responses'}
                value={String(aggregate?.total ?? 0)}
              />
              <KpiCard
                label={lang === 'zh' ? 'PMF（"非常失望" %）' : 'PMF (very disappointed %)'}
                value={
                  typeof aggregate?.pmf_pct_very_disappointed === 'number'
                    ? `${aggregate.pmf_pct_very_disappointed.toFixed(1)}%`
                    : '—'
                }
                accent={
                  typeof aggregate?.pmf_pct_very_disappointed === 'number' &&
                  aggregate.pmf_pct_very_disappointed >= 40
                    ? 'ok'
                    : 'warn'
                }
              />
              <KpiCard
                label={lang === 'zh' ? 'NPS 分数' : 'NPS score'}
                value={
                  typeof aggregate?.nps_score === 'number'
                    ? aggregate.nps_score.toFixed(0)
                    : '—'
                }
              />
            </div>

            {/* Likert means */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                {lang === 'zh' ? 'Likert 均值（5 分制）' : 'Likert means (out of 5)'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.keys(LIKERT_LABELS).map((k) => {
                  const v = aggregate?.likert_means?.[k] ?? 0
                  return (
                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 60px', gap: 12, alignItems: 'center' }}>
                      <div style={{ fontSize: 12 }}>{LIKERT_LABELS[k][lang]}</div>
                      <Progress value={v / likertMax} thin />
                      <div className="muted" style={{ fontSize: 12, textAlign: 'right' }}>
                        {v.toFixed(2)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Distributions */}
            <div
              style={{
                marginTop: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
              }}
            >
              <DistCard
                title={lang === 'zh' ? '考试方向' : 'Exam'}
                dist={aggregate?.exam_distribution}
              />
              <DistCard
                title={lang === 'zh' ? '语言' : 'Language'}
                dist={aggregate?.language_distribution}
              />
              <DistCard
                title={lang === 'zh' ? 'PMF 分布' : 'PMF distribution'}
                dist={aggregate?.pmf_distribution}
                relabel={(k) => PMF_LABELS[k]?.[lang] ?? k}
              />
            </div>
          </Section>

          {/* ---- Filters + table ---- */}
          <Section
            title={lang === 'zh' ? '原始反馈' : 'Raw responses'}
            tools={
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => downloadCsv(rows)}
                disabled={rows.length === 0}
              >
                {lang === 'zh' ? '导出 CSV' : 'Export CSV'}
              </button>
            }
          >
            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <FilterSelect
                label={lang === 'zh' ? '考试' : 'Exam'}
                value={examFilter}
                onChange={setExamFilter}
                options={examOptions}
              />
              <FilterSelect
                label={lang === 'zh' ? 'PMF' : 'PMF'}
                value={pmfFilter}
                onChange={setPmfFilter}
                options={['very_disappointed', 'somewhat', 'not']}
                relabel={(k) => PMF_LABELS[k]?.[lang] ?? k}
              />
              <FilterSelect
                label={lang === 'zh' ? '语言' : 'Language'}
                value={langFilter}
                onChange={setLangFilter}
                options={['en', 'zh']}
              />
            </div>

            {/* Table */}
            {rows.length === 0 ? (
              <div className="muted" style={{ padding: 16, fontSize: 13 }}>
                {lang === 'zh' ? '没有匹配的反馈' : 'No matching responses'}
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid var(--line, #e8ecf0)',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2, #f5f7fa)' }}>
                      <Th>{lang === 'zh' ? '时间' : 'When'}</Th>
                      <Th>{lang === 'zh' ? '考试' : 'Exam'}</Th>
                      <Th>{lang === 'zh' ? '年级' : 'Year'}</Th>
                      <Th>{lang === 'zh' ? '语言' : 'Lang'}</Th>
                      <Th>PMF</Th>
                      <Th>NPS</Th>
                      <Th>{lang === 'zh' ? '会话(分)' : 'Min'}</Th>
                      <Th>{lang === 'zh' ? '课数' : 'Lessons'}</Th>
                      <Th>{lang === 'zh' ? '操作' : ''}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const isOpen = expandedId === r.id
                      return (
                        <Fragment key={r.id}>
                          <tr
                            style={{ borderTop: '1px solid var(--line, #e8ecf0)' }}
                          >
                            <Td>{formatDate(r.created_at)}</Td>
                            <Td>{r.exam}</Td>
                            <Td>{r.school_year}</Td>
                            <Td>{r.language}</Td>
                            <Td>{PMF_LABELS[r.pmf_score]?.[lang] ?? r.pmf_score}</Td>
                            <Td>{typeof r.nps === 'number' ? r.nps : '—'}</Td>
                            <Td>{r.derived_session_minutes ?? '—'}</Td>
                            <Td>{r.derived_board_lessons ?? '—'}</Td>
                            <Td>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setExpandedId(isOpen ? null : r.id)}
                              >
                                {isOpen
                                  ? lang === 'zh' ? '收起' : 'Hide'
                                  : lang === 'zh' ? '查看' : 'View'}
                              </button>
                            </Td>
                          </tr>
                          {isOpen && (
                            <tr key={`${r.id}-detail`}>
                              <td
                                colSpan={9}
                                style={{
                                  background: 'var(--surface-2, #f5f7fa)',
                                  padding: 16,
                                  borderTop: '1px solid var(--line, #e8ecf0)',
                                }}
                              >
                                <DetailBlock
                                  label={lang === 'zh' ? '痛点' : 'Pain point'}
                                  value={r.pain_point}
                                />
                                <DetailBlock
                                  label={lang === 'zh' ? '功能需求' : 'Feature request'}
                                  value={r.feature_request}
                                />
                                <DetailBlock
                                  label={lang === 'zh' ? '其他反馈' : 'Other feedback'}
                                  value={r.other_feedback}
                                />
                                {r.contact_email && (
                                  <DetailBlock
                                    label={lang === 'zh' ? '联系邮箱' : 'Contact email'}
                                    value={r.contact_email}
                                  />
                                )}
                                {r.prior_tools?.length > 0 && (
                                  <DetailBlock
                                    label={lang === 'zh' ? '先前工具' : 'Prior tools'}
                                    value={r.prior_tools.join(', ')}
                                  />
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  )
}

// ---------- Sub-components ----------

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'ok' | 'warn'
}) {
  const color =
    accent === 'ok' ? 'var(--ok, #16a34a)' : accent === 'warn' ? 'var(--warn, #d97706)' : 'var(--ink, #111)'
  return (
    <div
      style={{
        padding: 16,
        border: '1px solid var(--line, #e8ecf0)',
        borderRadius: 12,
        background: 'var(--surface, #fff)',
      }}
    >
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color }}>{value}</div>
    </div>
  )
}

function DistCard({
  title,
  dist,
  relabel,
}: {
  title: string
  dist?: Record<string, number>
  relabel?: (k: string) => string
}) {
  const entries = Object.entries(dist || {}).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1
  return (
    <div
      style={{
        padding: 14,
        border: '1px solid var(--line, #e8ecf0)',
        borderRadius: 12,
        background: 'var(--surface, #fff)',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{title}</div>
      {entries.length === 0 && (
        <div className="muted" style={{ fontSize: 12 }}>—</div>
      )}
      {entries.map(([k, v]) => (
        <div
          key={k}
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 50px', gap: 8, alignItems: 'center', marginBottom: 6 }}
        >
          <div style={{ fontSize: 12 }}>{relabel ? relabel(k) : k}</div>
          <Progress value={v / total} thin />
          <div className="muted" style={{ fontSize: 12, textAlign: 'right' }}>
            {v}
          </div>
        </div>
      ))}
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  relabel,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  relabel?: (k: string) => string
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: 'var(--ink-muted)',
      }}
    >
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: 12,
          padding: '4px 8px',
          border: '1px solid var(--line, #e8ecf0)',
          borderRadius: 6,
          background: 'var(--surface, #fff)',
        }}
      >
        <option value="">{value === '' ? '— all —' : 'all'}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {relabel ? relabel(o) : o}
          </option>
        ))}
      </select>
    </label>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '8px 12px',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--ink-muted)',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
      }}
    >
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: '8px 12px', fontSize: 13, verticalAlign: 'middle' }}>
      {children}
    </td>
  )
}

function DetailBlock({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  )
}
