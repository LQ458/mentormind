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

interface FeedbackReportRow {
  id: string
  created_at: string
  user_id?: string | null
  session_id?: string | null
  page?: string | null
  url?: string | null
  captured_url?: string | null
  route?: string | null
  viewport_w?: number | null
  viewport_h?: number | null
  source?: string
  surface?: string
  feedback_kind?: string
  severity?: string
  interaction_id?: string
  report_id?: string
  user_note?: string
  expected_behavior?: string
  recent_events?: Array<Record<string, unknown>>
  recent_errors?: Array<Record<string, unknown>>
  app_snapshot?: Record<string, unknown>
}

interface FeedbackListResponse {
  rows?: FeedbackRow[]
  total?: number
  // Allow pass-through error shapes
  error?: string
}

interface FeedbackReportsResponse {
  rows?: FeedbackReportRow[]
  total?: number
  truncated?: boolean
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

interface FeedbackReportsAggregateResponse {
  total?: number
  surface_distribution?: Record<string, number>
  kind_distribution?: Record<string, number>
  severity_distribution?: Record<string, number>
  page_distribution?: Record<string, number>
  truncated?: boolean
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

function compactJson(value: unknown): string {
  if (!value) return ''
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function downloadReportCsv(rows: FeedbackReportRow[]) {
  const headers = [
    'id', 'report_id', 'created_at', 'surface', 'feedback_kind', 'severity', 'page',
    'user_note', 'expected_behavior', 'captured_url', 'recent_errors', 'app_snapshot',
  ]
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push([
      r.id, r.report_id || '', r.created_at, r.surface || '', r.feedback_kind || '', r.severity || '',
      r.page || r.route || '', r.user_note || '', r.expected_behavior || '', r.captured_url || r.url || '',
      compactJson(r.recent_errors), compactJson(r.app_snapshot),
    ].map(csvEscape).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mm-bug-reports-${new Date().toISOString().slice(0, 10)}.csv`
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
  const [reportsAggregate, setReportsAggregate] = useState<FeedbackReportsAggregateResponse | null>(null)
  const [reports, setReports] = useState<FeedbackReportRow[]>([])
  const [reportsTotal, setReportsTotal] = useState(0)
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusCode, setStatusCode] = useState<number | null>(null)

  // Filters
  const [examFilter, setExamFilter] = useState<string>('')
  const [pmfFilter, setPmfFilter] = useState<string>('')
  const [langFilter, setLangFilter] = useState<string>('')
  const [surfaceFilter, setSurfaceFilter] = useState<string>('')
  const [kindFilter, setKindFilter] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('')

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    setStatusCode(null)
    try {
      const params = new URLSearchParams()
      params.set('limit', '50')
      params.set('offset', '0')
      if (examFilter) params.set('exam', examFilter)
      if (pmfFilter) params.set('pmf', pmfFilter)
      if (langFilter) params.set('language', langFilter)

      const reportParams = new URLSearchParams()
      reportParams.set('limit', '80')
      reportParams.set('offset', '0')
      if (surfaceFilter) reportParams.set('surface', surfaceFilter)
      if (kindFilter) reportParams.set('kind', kindFilter)
      if (severityFilter) reportParams.set('severity', severityFilter)

      const [reportAggRes, reportListRes, aggRes, listRes] = await Promise.all([
        fetch('/api/backend/admin/feedback/reports/aggregate'),
        fetch(`/api/backend/admin/feedback/reports?${reportParams.toString()}`),
        fetch('/api/backend/admin/feedback/aggregate'),
        fetch(`/api/backend/admin/feedback?${params.toString()}`),
      ])

      const authFailure = !listRes.ok ? listRes : !reportListRes.ok ? reportListRes : null
      if (authFailure) {
        setStatusCode(authFailure.status)
        const data = (await authFailure.json().catch(() => ({}))) as { error?: string; detail?: string }
        if (authFailure.status === 401 || authFailure.status === 403) {
          setError(lang === 'zh' ? '需要管理员权限' : 'Sign in required (admin only)')
        } else {
          setError(data.error || data.detail || `HTTP ${authFailure.status}`)
        }
        setAggregate(null)
        setReportsAggregate(null)
        setReports([])
        setReportsTotal(0)
        setRows([])
        return
      }

      const reportAggData = (await reportAggRes.json().catch(() => ({}))) as FeedbackReportsAggregateResponse
      const reportListData = (await reportListRes.json().catch(() => ({}))) as FeedbackReportsResponse
      const aggData = (await aggRes.json().catch(() => ({}))) as AggregateResponse
      const listData = (await listRes.json().catch(() => ({}))) as FeedbackListResponse

      setReportsAggregate(reportAggData)
      setReports(reportListData.rows || [])
      setReportsTotal(reportListData.total || 0)
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
  }, [examFilter, pmfFilter, langFilter, surfaceFilter, kindFilter, severityFilter])

  const examOptions = useMemo(() => {
    const seen = new Set<string>()
    rows.forEach((r) => seen.add(r.exam))
    Object.keys(aggregate?.exam_distribution || {}).forEach((k) => seen.add(k))
    return Array.from(seen).filter(Boolean).sort()
  }, [rows, aggregate])

  const surfaceOptions = useMemo(() => {
    const seen = new Set<string>()
    reports.forEach((r) => {
      if (r.surface) seen.add(r.surface)
    })
    Object.keys(reportsAggregate?.surface_distribution || {}).forEach((k) => seen.add(k))
    return Array.from(seen).filter(Boolean).sort()
  }, [reports, reportsAggregate])

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
          {/* ---- Quick bug reports ---- */}
          <Section
            title={lang === 'zh' ? '快速 Bug 报告' : 'Quick bug reports'}
            tools={
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => downloadReportCsv(reports)}
                disabled={reports.length === 0}
              >
                {lang === 'zh' ? '导出报告 CSV' : 'Export reports CSV'}
              </button>
            }
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 16,
              }}
            >
              <KpiCard
                label={lang === 'zh' ? '快速报告数' : 'Quick reports'}
                value={String(reportsAggregate?.total ?? reportsTotal)}
              />
              <KpiCard
                label={lang === 'zh' ? '当前筛选命中' : 'Filtered matches'}
                value={String(reportsTotal)}
              />
              <KpiCard
                label={lang === 'zh' ? '最近严重问题' : 'Blocked / wrong'}
                value={String(
                  (reportsAggregate?.severity_distribution?.blocked || 0) +
                  (reportsAggregate?.severity_distribution?.wrong || 0),
                )}
                accent={(reportsAggregate?.severity_distribution?.blocked || 0) > 0 ? 'warn' : undefined}
              />
            </div>

            <div
              style={{
                marginTop: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 16,
              }}
            >
              <DistCard
                title={lang === 'zh' ? '问题表面' : 'Surface'}
                dist={reportsAggregate?.surface_distribution}
              />
              <DistCard
                title={lang === 'zh' ? '反馈类型' : 'Kind'}
                dist={reportsAggregate?.kind_distribution}
              />
              <DistCard
                title={lang === 'zh' ? '严重程度' : 'Severity'}
                dist={reportsAggregate?.severity_distribution}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0 12px' }}>
              <FilterSelect
                label={lang === 'zh' ? '表面' : 'Surface'}
                value={surfaceFilter}
                onChange={setSurfaceFilter}
                options={surfaceOptions}
              />
              <FilterSelect
                label={lang === 'zh' ? '类型' : 'Kind'}
                value={kindFilter}
                onChange={setKindFilter}
                options={['bug', 'function', 'feeling', 'general']}
              />
              <FilterSelect
                label={lang === 'zh' ? '严重度' : 'Severity'}
                value={severityFilter}
                onChange={setSeverityFilter}
                options={['blocked', 'wrong', 'confusing', 'slow', 'visual', 'idea']}
              />
            </div>

            {reports.length === 0 ? (
              <div className="muted" style={{ padding: 16, fontSize: 13 }}>
                {lang === 'zh' ? '没有匹配的快速报告' : 'No matching quick reports'}
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
                      <Th>{lang === 'zh' ? '表面' : 'Surface'}</Th>
                      <Th>{lang === 'zh' ? '类型' : 'Kind'}</Th>
                      <Th>{lang === 'zh' ? '严重度' : 'Severity'}</Th>
                      <Th>{lang === 'zh' ? '页面' : 'Page'}</Th>
                      <Th>{lang === 'zh' ? '用户描述' : 'Note'}</Th>
                      <Th>{lang === 'zh' ? '错误线索' : 'Errors'}</Th>
                      <Th>{lang === 'zh' ? '操作' : ''}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => {
                      const isOpen = expandedReportId === r.id
                      return (
                        <Fragment key={r.id}>
                          <tr style={{ borderTop: '1px solid var(--line, #e8ecf0)' }}>
                            <Td>{formatDate(r.created_at)}</Td>
                            <Td>{r.surface || '—'}</Td>
                            <Td>{r.feedback_kind || '—'}</Td>
                            <Td>{r.severity || '—'}</Td>
                            <Td>{r.page || r.route || '—'}</Td>
                            <Td>
                              <span style={{ display: 'block', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.user_note || r.expected_behavior || '—'}
                              </span>
                            </Td>
                            <Td>{r.recent_errors?.length || 0}</Td>
                            <Td>
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setExpandedReportId(isOpen ? null : r.id)}
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
                                colSpan={8}
                                style={{
                                  background: 'var(--surface-2, #f5f7fa)',
                                  padding: 16,
                                  borderTop: '1px solid var(--line, #e8ecf0)',
                                }}
                              >
                                <DetailBlock
                                  label={lang === 'zh' ? 'Report ID' : 'Report ID'}
                                  value={r.report_id || r.id}
                                />
                                <DetailBlock
                                  label={lang === 'zh' ? '用户描述' : 'User note'}
                                  value={r.user_note}
                                />
                                <DetailBlock
                                  label={lang === 'zh' ? '期望行为' : 'Expected behavior'}
                                  value={r.expected_behavior}
                                />
                                <DetailBlock
                                  label="URL"
                                  value={r.captured_url || r.url || ''}
                                />
                                <JsonBlock
                                  label={lang === 'zh' ? '最近错误' : 'Recent errors'}
                                  value={r.recent_errors}
                                />
                                <JsonBlock
                                  label={lang === 'zh' ? '最近事件' : 'Recent events'}
                                  value={r.recent_events}
                                />
                                <JsonBlock
                                  label={lang === 'zh' ? '页面快照' : 'App snapshot'}
                                  value={r.app_snapshot}
                                />
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

function JsonBlock({ label, value }: { label: string; value?: unknown }) {
  const text = compactJson(value)
  if (!text || text === '[]' || text === '{}') return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          maxHeight: 220,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          border: '1px solid var(--line, #e8ecf0)',
          borderRadius: 8,
          background: 'var(--surface, #fff)',
          padding: 10,
          fontSize: 12,
        }}
      >
        {text}
      </pre>
    </div>
  )
}
