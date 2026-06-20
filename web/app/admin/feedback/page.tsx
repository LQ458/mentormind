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
  pmf_score: string | null
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
  tester?: {
    id?: string
    username?: string
    email?: string
    role?: string
    language_preference?: string
    created_at?: string | null
    last_login_at?: string | null
  } | null
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
  build?: Record<string, unknown>
  app_snapshot?: Record<string, unknown>
  priority_score?: number
  priority_reasons?: string[]
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
  unique_reports?: number
  duplicate_reports?: number
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
  unique_reports?: number
  duplicate_reports?: number
  source_distribution?: Record<string, number>
  surface_distribution?: Record<string, number>
  kind_distribution?: Record<string, number>
  severity_distribution?: Record<string, number>
  page_distribution?: Record<string, number>
  priority_reports?: FeedbackReportRow[]
  truncated?: boolean
  error?: string
}

interface FeedbackReportContextResponse {
  report?: FeedbackReportRow
  events?: Array<Record<string, unknown>>
  errors?: Array<Record<string, unknown>>
  event_count?: number
  error_count?: number
  truncated?: boolean
  error?: string
  detail?: string
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
  let s = typeof v === 'string' ? v : JSON.stringify(v)
  // Prevent tester-provided text from being interpreted as a spreadsheet formula.
  if (typeof v === 'string' && /^[\s]*[=+\-@]/.test(s)) s = `'${s}`
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

function prettyJson(value: unknown): string {
  if (!value) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function markdownFence(text: string): string {
  const matches: string[] = text.match(/`+/g) || []
  const longest = matches.reduce((max, item) => Math.max(max, item.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

function codeBlock(value: unknown): string {
  const text = prettyJson(value)
  if (!text || text === '[]' || text === '{}') return '—'
  const fence = markdownFence(text)
  return `${fence}json\n${text}\n${fence}`
}

function textBlock(value: string | null | undefined): string {
  const text = String(value || '').trim()
  if (!text) return '—'
  const fence = markdownFence(text)
  return `${fence}text\n${text}\n${fence}`
}

function formatBuild(build?: Record<string, unknown>): string {
  if (!build) return '—'
  const sha = typeof build.sha === 'string' ? build.sha : ''
  const tag = typeof build.image_tag === 'string' ? build.image_tag : ''
  return [sha, tag].filter(Boolean).join(' / ') || '—'
}

function formatTester(r: FeedbackReportRow): string {
  const username = r.tester?.username || ''
  const email = r.tester?.email || ''
  const userId = r.user_id || ''
  if (username && email) return `${username} / ${email}`
  return username || email || userId || '—'
}

function formatTesterForIssue(r: FeedbackReportRow): string {
  const username = r.tester?.username || ''
  if (username) return `${username} (signed-in tester)`
  return r.user_id ? 'Signed-in tester (see admin dashboard)' : 'Anonymous tester'
}

function redactedTesterForIssue(r: FeedbackReportRow): Record<string, unknown> | null {
  if (!r.tester && !r.user_id) return null
  return {
    signed_in: Boolean(r.user_id),
    username: r.tester?.username || undefined,
    role: r.tester?.role || undefined,
    language_preference: r.tester?.language_preference || undefined,
    created_at: r.tester?.created_at || undefined,
    last_login_at: r.tester?.last_login_at || undefined,
    admin_lookup: 'Use Report ID in the admin feedback dashboard for full tester details.',
  }
}

function adminAccessRequiredMessage(lang: string): string {
  return lang === 'zh'
    ? '需要管理员权限。请使用管理员账号登录后再查看反馈数据。'
    : 'Admin access required. Sign in with an admin account to view feedback data.'
}

function reportMarkdown(r: FeedbackReportRow, context?: FeedbackReportContextResponse | null): string {
  const page = r.page || r.route || '—'
  const url = r.captured_url || r.url || '—'
  const titleParts = [r.severity, r.surface || page].filter(Boolean).join(' / ')
  const title = titleParts || r.report_id || r.id
  const viewport = r.viewport_w && r.viewport_h ? `${r.viewport_w}x${r.viewport_h}` : '—'
  const lines = [
    `# ${title}`,
    '',
    '## Summary',
    `- Report ID: ${r.report_id || r.id}`,
    `- Created: ${r.created_at}`,
    `- Source: ${r.source || '—'}`,
    `- Tester: ${formatTesterForIssue(r)}`,
    `- Surface: ${r.surface || '—'}`,
    `- Kind: ${r.feedback_kind || '—'}`,
    `- Severity: ${r.severity || '—'}`,
    `- Priority: ${r.priority_score ?? '—'}${r.priority_reasons?.length ? ` (${r.priority_reasons.join(', ')})` : ''}`,
    `- Page: ${page}`,
    `- URL: ${url}`,
    `- Viewport: ${viewport}`,
    `- Build: ${formatBuild(r.build)}`,
    '',
    '## User note',
    textBlock(r.user_note),
    '',
    '## Expected behavior',
    textBlock(r.expected_behavior),
    '',
    '## Reproduction checklist',
    `- Start at: ${url}`,
    `- Page/surface: ${page} / ${r.surface || '—'}`,
    `- Tester context: ${formatTesterForIssue(r)}`,
    `- Device: ${viewport}`,
    `- Build: ${formatBuild(r.build)}`,
    '- Reproduce the user note above, then compare against the expected behavior.',
    '- Check recent errors and same-session context below before assigning.',
    '',
    '## Recent errors',
    codeBlock(r.recent_errors),
    '',
    '## Recent events',
    codeBlock(r.recent_events),
    '',
    '## App snapshot',
    codeBlock(r.app_snapshot),
    '',
    '## Build',
    codeBlock(r.build),
    '',
    '## Tester',
    codeBlock(redactedTesterForIssue(r)),
  ]
  if (context) {
    lines.push(
      '',
      '## Same-session context',
      `- Event count: ${context.event_count ?? context.events?.length ?? 0}`,
      `- Error count: ${context.error_count ?? context.errors?.length ?? 0}`,
      `- Truncated: ${context.truncated ? 'yes' : 'no'}`,
      '',
      '### Context errors',
      codeBlock(context.errors),
      '',
      '### Context event timeline',
      codeBlock(context.events),
    )
  }
  return lines.join('\n')
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return true
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  const ok = document.execCommand('copy')
  textarea.remove()
  return ok
}

function downloadReportCsv(rows: FeedbackReportRow[]) {
  const headers = [
    'id', 'report_id', 'created_at', 'source', 'tester', 'signed_in_tester',
    'surface', 'feedback_kind', 'severity', 'page', 'user_note', 'expected_behavior', 'captured_url',
    'build', 'recent_errors', 'app_snapshot', 'admin_lookup',
  ]
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push([
      r.id, r.report_id || '', r.created_at, r.source || '',
      formatTesterForIssue(r), r.user_id ? 'true' : 'false',
      r.surface || '', r.feedback_kind || '', r.severity || '', r.page || r.route || '',
      r.user_note || '', r.expected_behavior || '', r.captured_url || r.url || '',
      compactJson(r.build), compactJson(r.recent_errors), compactJson(r.app_snapshot),
      'Use Report ID in the admin dashboard for full tester details.',
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

async function responseErrorMessage(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string }
  return data.error || data.detail || `HTTP ${res.status}`
}

// ---------- Page ----------

export default function AdminFeedbackPage() {
  const { language } = useLanguage()
  const lang: 'zh' | 'en' = language === 'zh' ? 'zh' : 'en'

  const [aggregate, setAggregate] = useState<AggregateResponse | null>(null)
  const [reportsAggregate, setReportsAggregate] = useState<FeedbackReportsAggregateResponse | null>(null)
  const [reports, setReports] = useState<FeedbackReportRow[]>([])
  const [reportsTotal, setReportsTotal] = useState(0)
  const [reportsUniqueTotal, setReportsUniqueTotal] = useState(0)
  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusCode, setStatusCode] = useState<number | null>(null)

  // Filters
  const [examFilter, setExamFilter] = useState<string>('')
  const [pmfFilter, setPmfFilter] = useState<string>('')
  const [langFilter, setLangFilter] = useState<string>('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [surfaceFilter, setSurfaceFilter] = useState<string>('')
  const [kindFilter, setKindFilter] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('')

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null)
  const [copiedReportId, setCopiedReportId] = useState<string | null>(null)
  const [contextByReportId, setContextByReportId] = useState<Record<string, FeedbackReportContextResponse>>({})
  const [contextLoadingId, setContextLoadingId] = useState<string | null>(null)
  const [contextErrorByReportId, setContextErrorByReportId] = useState<Record<string, string>>({})

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
      if (sourceFilter) reportParams.set('source', sourceFilter)
      if (surfaceFilter) reportParams.set('surface', surfaceFilter)
      if (kindFilter) reportParams.set('kind', kindFilter)
      if (severityFilter) reportParams.set('severity', severityFilter)

      const [reportAggRes, reportListRes, aggRes, listRes] = await Promise.all([
        fetch('/api/backend/admin/feedback/reports/aggregate'),
        fetch(`/api/backend/admin/feedback/reports?${reportParams.toString()}`),
        fetch('/api/backend/admin/feedback/aggregate'),
        fetch(`/api/backend/admin/feedback?${params.toString()}`),
      ])

      const failedResponse = [reportAggRes, reportListRes, aggRes, listRes].find((res) => !res.ok)
      if (failedResponse) {
        setStatusCode(failedResponse.status)
        const message = await responseErrorMessage(failedResponse)
        if (failedResponse.status === 401 || failedResponse.status === 403) {
          setError('admin_access_required')
        } else {
          setError(message)
        }
        setAggregate(null)
        setReportsAggregate(null)
        setReports([])
        setReportsTotal(0)
        setReportsUniqueTotal(0)
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
      setReportsUniqueTotal(reportListData.unique_reports ?? reportListData.total ?? 0)
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
  }, [examFilter, pmfFilter, langFilter, sourceFilter, surfaceFilter, kindFilter, severityFilter])

  const examOptions = useMemo(() => {
    const seen = new Set<string>()
    rows.forEach((r) => seen.add(r.exam))
    Object.keys(aggregate?.exam_distribution || {}).forEach((k) => seen.add(k))
    return Array.from(seen).filter(Boolean).sort()
  }, [rows, aggregate])

  const sourceOptions = useMemo(() => {
    const seen = new Set<string>()
    reports.forEach((r) => {
      if (r.source) seen.add(r.source)
    })
    Object.keys(reportsAggregate?.source_distribution || {}).forEach((k) => seen.add(k))
    return Array.from(seen).filter(Boolean).sort()
  }, [reports, reportsAggregate])

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

  const fetchReportContext = async (report: FeedbackReportRow) => {
    if (contextByReportId[report.id]) {
      return contextByReportId[report.id]
    }
    setContextLoadingId(report.id)
    setContextErrorByReportId((prev) => ({ ...prev, [report.id]: '' }))
    try {
      const res = await fetch(`/api/backend/admin/feedback/reports/${encodeURIComponent(report.id)}/context`)
      const data = (await res.json().catch(() => ({}))) as FeedbackReportContextResponse
      if (!res.ok) {
        setContextErrorByReportId((prev) => ({
          ...prev,
          [report.id]: data.error || data.detail || `HTTP ${res.status}`,
        }))
        return null
      }
      setContextByReportId((prev) => ({ ...prev, [report.id]: data }))
      return data
    } catch {
      setContextErrorByReportId((prev) => ({
        ...prev,
        [report.id]: lang === 'zh' ? '上下文加载失败' : 'Failed to load context',
      }))
      return null
    } finally {
      setContextLoadingId((current) => (current === report.id ? null : current))
    }
  }

  const copyReport = async (report: FeedbackReportRow) => {
    const context = await fetchReportContext(report)
    const ok = await copyText(reportMarkdown(report, context)).catch(() => false)
    if (!ok) return
    setCopiedReportId(report.id)
    window.setTimeout(() => {
      setCopiedReportId((current) => (current === report.id ? null : current))
    }, 1800)
  }

  const loadReportContext = async (report: FeedbackReportRow) => {
    const context = await fetchReportContext(report)
    if (context) setExpandedReportId(report.id)
  }

  const priorityReports = reportsAggregate?.priority_reports || []

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
          {statusCode === 401 || statusCode === 403 ? adminAccessRequiredMessage(lang) : error}
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
                label={lang === 'zh' ? '去重问题数' : 'Unique reports'}
                value={String(reportsAggregate?.unique_reports ?? reportsTotal)}
              />
              <KpiCard
                label={lang === 'zh' ? '当前筛选命中' : 'Filtered matches'}
                value={String(reportsTotal)}
              />
              <KpiCard
                label={lang === 'zh' ? '筛选去重' : 'Filtered unique'}
                value={String(reportsUniqueTotal)}
              />
              <KpiCard
                label={lang === 'zh' ? '重复上报' : 'Duplicates'}
                value={String(reportsAggregate?.duplicate_reports ?? 0)}
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

            {priorityReports.length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  border: '1px solid var(--line, #e8ecf0)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: 'var(--surface, #fff)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: 'var(--surface-2, #f5f7fa)',
                    borderBottom: '1px solid var(--line, #e8ecf0)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {lang === 'zh' ? '建议优先处理' : 'Suggested triage queue'}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {lang === 'zh' ? '按阻塞、错误线索和可复现信息排序' : 'Ranked by severity, error clues, and reproducibility detail'}
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <Th>{lang === 'zh' ? '分数' : 'Score'}</Th>
                      <Th>{lang === 'zh' ? '严重度' : 'Severity'}</Th>
                      <Th>{lang === 'zh' ? '表面' : 'Surface'}</Th>
                      <Th>{lang === 'zh' ? '测试者' : 'Tester'}</Th>
                      <Th>Build</Th>
                      <Th>{lang === 'zh' ? '描述' : 'Note'}</Th>
                      <Th>{lang === 'zh' ? '原因' : 'Reasons'}</Th>
                      <Th>{lang === 'zh' ? '操作' : ''}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {priorityReports.map((r) => {
                      const isPriorityOpen = expandedReportId === r.id
                      return (
                        <Fragment key={`priority-${r.id}`}>
                          <tr style={{ borderTop: '1px solid var(--line, #e8ecf0)' }}>
                            <Td>{r.priority_score ?? 0}</Td>
                            <Td>{r.severity || '—'}</Td>
                            <Td>{r.surface || r.page || r.route || '—'}</Td>
                            <Td>{formatTester(r)}</Td>
                            <Td>{formatBuild(r.build)}</Td>
                            <Td>
                              <span style={{ display: 'block', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.user_note || r.expected_behavior || '—'}
                              </span>
                            </Td>
                            <Td>
                              <span className="muted" style={{ fontSize: 12 }}>
                                {(r.priority_reasons || []).join(', ') || '—'}
                              </span>
                            </Td>
                            <Td>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => {
                                    setExpandedReportId(isPriorityOpen ? null : r.id)
                                    if (!isPriorityOpen) void fetchReportContext(r)
                                  }}
                                >
                                  {isPriorityOpen
                                    ? lang === 'zh' ? '收起' : 'Hide'
                                    : lang === 'zh' ? '查看' : 'View'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => copyReport(r)}
                                >
                                  {copiedReportId === r.id
                                    ? lang === 'zh' ? '已复制' : 'Copied'
                                    : lang === 'zh' ? '复制 Issue' : 'Copy issue'}
                                </button>
                              </div>
                            </Td>
                          </tr>
                          {isPriorityOpen && (
                            <tr key={`priority-${r.id}-detail`}>
                              <td
                                colSpan={8}
                                style={{
                                  background: 'var(--surface-2, #f5f7fa)',
                                  padding: 16,
                                  borderTop: '1px solid var(--line, #e8ecf0)',
                                }}
                              >
                                <DetailBlock label="Report ID" value={r.report_id || r.id} />
                                <DetailBlock label={lang === 'zh' ? '测试者' : 'Tester'} value={formatTester(r)} />
                                <DetailBlock label="Session ID" value={r.session_id || ''} />
                                <DetailBlock label={lang === 'zh' ? '用户描述' : 'User note'} value={r.user_note} />
                                <DetailBlock label={lang === 'zh' ? '期望行为' : 'Expected behavior'} value={r.expected_behavior} />
                                <DetailBlock label="Build" value={formatBuild(r.build)} />
                                <DetailBlock label="URL" value={r.captured_url || r.url || ''} />
                                <JsonBlock label={lang === 'zh' ? '测试者信息' : 'Tester metadata'} value={r.tester} />
                                <JsonBlock label="Build metadata" value={r.build} />
                                <JsonBlock label={lang === 'zh' ? '最近错误' : 'Recent errors'} value={r.recent_errors} />
                                <JsonBlock label={lang === 'zh' ? '页面快照' : 'App snapshot'} value={r.app_snapshot} />
                                {contextErrorByReportId[r.id] && (
                                  <DetailBlock
                                    label={lang === 'zh' ? '上下文加载错误' : 'Context error'}
                                    value={contextErrorByReportId[r.id]}
                                  />
                                )}
                                {contextByReportId[r.id] && (
                                  <FeedbackContextPanel context={contextByReportId[r.id]} lang={lang} />
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

            <div
              style={{
                marginTop: 16,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 16,
              }}
            >
              <DistCard
                title={lang === 'zh' ? '来源' : 'Source'}
                dist={reportsAggregate?.source_distribution}
              />
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
                label={lang === 'zh' ? '来源' : 'Source'}
                value={sourceFilter}
                onChange={setSourceFilter}
                options={sourceOptions}
              />
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
                options={['blocked', 'wrong', 'confusing', 'slow', 'visual', 'quality', 'idea']}
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
                      <Th>{lang === 'zh' ? '来源' : 'Source'}</Th>
                      <Th>{lang === 'zh' ? '测试者' : 'Tester'}</Th>
                      <Th>Build</Th>
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
                            <Td>{r.source || '—'}</Td>
                            <Td>{formatTester(r)}</Td>
                            <Td>{formatBuild(r.build)}</Td>
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
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => setExpandedReportId(isOpen ? null : r.id)}
                                >
                                  {isOpen
                                    ? lang === 'zh' ? '收起' : 'Hide'
                                    : lang === 'zh' ? '查看' : 'View'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => copyReport(r)}
                                >
                                  {copiedReportId === r.id
                                    ? lang === 'zh' ? '已复制' : 'Copied'
                                    : lang === 'zh' ? '复制 Issue' : 'Copy issue'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => loadReportContext(r)}
                                  disabled={contextLoadingId === r.id}
                                >
                                  {contextLoadingId === r.id
                                    ? lang === 'zh' ? '加载中' : 'Loading'
                                    : lang === 'zh' ? '上下文' : 'Context'}
                                </button>
                              </div>
                            </Td>
                          </tr>
                          {isOpen && (
                            <tr key={`${r.id}-detail`}>
                              <td
                                colSpan={11}
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
                                  label={lang === 'zh' ? '测试者' : 'Tester'}
                                  value={formatTester(r)}
                                />
                                <DetailBlock
                                  label="Session ID"
                                  value={r.session_id || ''}
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
                                  label="Build"
                                  value={formatBuild(r.build)}
                                />
                                <DetailBlock
                                  label="URL"
                                  value={r.captured_url || r.url || ''}
                                />
                                <JsonBlock
                                  label={lang === 'zh' ? '测试者信息' : 'Tester metadata'}
                                  value={r.tester}
                                />
                                <JsonBlock
                                  label="Build metadata"
                                  value={r.build}
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
                                {contextErrorByReportId[r.id] && (
                                  <DetailBlock
                                    label={lang === 'zh' ? '上下文加载错误' : 'Context error'}
                                    value={contextErrorByReportId[r.id]}
                                  />
                                )}
                                {contextByReportId[r.id] && (
                                  <FeedbackContextPanel
                                    context={contextByReportId[r.id]}
                                    lang={lang}
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

function FeedbackContextPanel({
  context,
  lang,
}: {
  context: FeedbackReportContextResponse
  lang: 'zh' | 'en'
}) {
  const events = context.events || []
  const errors = context.errors || []
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        border: '1px solid var(--line, #e8ecf0)',
        borderRadius: 10,
        background: 'var(--surface, #fff)',
      }}
    >
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>
          {lang === 'zh' ? '同会话上下文' : 'Same-session context'}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {lang === 'zh' ? '事件' : 'Events'}: {context.event_count ?? events.length}
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {lang === 'zh' ? '错误' : 'Errors'}: {context.error_count ?? errors.length}
        </span>
        {context.truncated && (
          <span style={{ fontSize: 12, color: 'var(--warn, #d97706)' }}>
            {lang === 'zh' ? '已截断' : 'Truncated'}
          </span>
        )}
      </div>
      <JsonBlock
        label={lang === 'zh' ? '上下文错误' : 'Context errors'}
        value={errors}
      />
      <JsonBlock
        label={lang === 'zh' ? '上下文事件时间线' : 'Context event timeline'}
        value={events}
      />
    </div>
  )
}
