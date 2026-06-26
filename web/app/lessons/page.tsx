'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '../components/AuthContext'
import { getSubject } from '../lib/subjects'
import { getFramework } from '../lib/frameworks'
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Clock,
  Square,
  CheckSquare,
  Trash2,
} from 'lucide-react'
import { PageHead, Progress, Chip } from '../components/design/primitives'
import { Skeleton } from '../components/Skeleton'

// ---- Types ---------------------------------------------------------------

interface UnitTopic {
  id: string
  title: string
}

interface PlanUnit {
  id: string
  order_index: number
  title: string
  topics: UnitTopic[]
  estimated_minutes: number
  content_status: string
  is_completed: boolean
  score: number | null
  board_session_id: string | null
}

interface StudyPlan {
  id: string
  title: string
  subject: string
  framework: string
  status: string
  progress_percentage: number
  language: string
  deleted_at?: string | null
  purge_after?: string | null
  units: PlanUnit[]
}

interface LibraryResponse {
  success: boolean
  plans: StudyPlan[]
}

// ---- Helpers -------------------------------------------------------------

function normalizeStatus(status: string): string {
  return status.toLowerCase().trim()
}

function statusKind(status: string): 'ok' | 'accent' | 'warn' | '' {
  const normalized = normalizeStatus(status)
  if (normalized === 'completed' || normalized === 'ready') return 'ok'
  if (
    normalized === 'in_progress' ||
    normalized === 'generating' ||
    normalized === 'pending' ||
    normalized === 'queued' ||
    normalized === 'processing'
  ) {
    return 'accent'
  }
  if (normalized === 'failed' || normalized === 'error') return 'warn'
  return ''
}

function statusLabel(status: string, lang: 'en' | 'zh'): string {
  const normalized = normalizeStatus(status)
  if (lang === 'zh') {
    const labels: Record<string, string> = {
      completed: '已完成',
      in_progress: '进行中',
      not_started: '未开始',
      ready: '可学习',
      generating: '生成中',
      pending: '等待生成',
      queued: '排队中',
      processing: '处理中',
      failed: '生成失败',
      error: '生成失败',
    }
    return labels[normalized] ?? '未知状态'
  }
  const labels: Record<string, string> = {
    completed: 'Completed',
    in_progress: 'In progress',
    not_started: 'Not started',
    ready: 'Ready',
    generating: 'Generating',
    pending: 'Pending',
    queued: 'Queued',
    processing: 'Processing',
    failed: 'Failed',
    error: 'Failed',
  }
  return labels[normalized] ?? normalized.replace(/[_-]+/g, ' ').replace(/^\w/, (char) => char.toUpperCase())
}

function subjectLabel(subject: string, lang: 'en' | 'zh'): string {
  const meta = getSubject(subject)
  return lang === 'zh' ? meta?.labelZh ?? subject : meta?.label ?? subject
}

function frameworkLabel(framework: string, lang: 'en' | 'zh'): string {
  const meta = getFramework(framework)
  return lang === 'zh' ? meta?.labelZh ?? framework.toUpperCase() : meta?.label ?? framework.toUpperCase()
}

// ---- Unit Card -----------------------------------------------------------

function UnitCard({
  unit,
  plan,
  deleting,
  onDelete,
}: {
  unit: PlanUnit
  plan: StudyPlan
  deleting: boolean
  onDelete: (planId: string, unitId: string) => void
}) {
  const { language } = useLanguage()
  const { getToken } = useAuth()
  const router = useRouter()
  const lang: 'en' | 'zh' = language === 'zh' ? 'zh' : 'en'
  const [starting, setStarting] = useState(false)

  const handleStart = useCallback(async () => {
    setStarting(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(
        `/api/backend/study-plan/${plan.id}/unit/${unit.id}/board-lesson`,
        { method: 'POST', headers, body: JSON.stringify({}) },
      )
      const data = await res.json()
      if (data?.session_id) {
        router.push(`/board/${data.session_id}`)
      }
    } catch {
      // navigation failed — just reset
    } finally {
      setStarting(false)
    }
  }, [plan.id, unit.id, getToken, router])

  const kind = statusKind(unit.content_status)
  const label = statusLabel(unit.content_status, lang)

  return (
    <div
      className="card-new"
      style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {/* Top row: status chip + completion */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Chip kind={kind} dot>
          {label}
        </Chip>
        {unit.is_completed && (
          <CheckCircle2 size={15} style={{ marginLeft: 'auto', color: 'var(--ok, #22c55e)' }} />
        )}
        {unit.score !== null && !unit.is_completed && (
          <span
            className="muted"
            style={{ marginLeft: 'auto', fontSize: 11 }}
          >
            {Math.round(unit.score)}%
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.35 }}>{unit.title}</div>

      {/* Parent plan name */}
      <div className="muted" style={{ fontSize: 11 }}>
        {plan.title}
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Clock size={12} style={{ color: 'var(--ink-muted)' }} />
        <span className="muted" style={{ fontSize: 11 }}>
          {unit.estimated_minutes} {lang === 'zh' ? '分钟' : 'min'}
        </span>
      </div>

      {/* CTA */}
      <div style={{ marginTop: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {unit.board_session_id ? (
          <Link
            href={`/board/${unit.board_session_id}`}
            className="btn btn-sm btn-primary"
            style={{ flex: 1, justifyContent: 'center', textAlign: 'center' }}
          >
            {lang === 'zh' ? '继续学习' : 'Resume'} <ArrowRight size={13} />
          </Link>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={handleStart}
            disabled={starting}
          >
            {starting
              ? lang === 'zh' ? '准备中…' : 'Starting…'
              : lang === 'zh' ? '开始学习' : 'Start lesson'}
            {!starting && <ArrowRight size={13} />}
          </button>
        )}
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onDelete(plan.id, unit.id)}
          disabled={deleting || starting}
          aria-label={lang === 'zh' ? '删除课程' : 'Delete lesson'}
          title={lang === 'zh' ? '删除课程' : 'Delete lesson'}
          style={{
            color: 'var(--color-danger, #dc2626)',
            borderColor: 'color-mix(in oklch, var(--color-danger, #dc2626) 35%, var(--line))',
          }}
        >
          <Trash2 size={13} />
          {lang === 'zh' ? '删除' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

// ---- Plan Section --------------------------------------------------------

function PlanSection({
  plan,
  collapsed,
  selected,
  deleting,
  deletingUnitIds,
  onToggle,
  onSelect,
  onDelete,
  onDeleteUnit,
}: {
  plan: StudyPlan
  collapsed: boolean
  selected: boolean
  deleting: boolean
  deletingUnitIds: Set<string>
  onToggle: (planId: string) => void
  onSelect: (planId: string) => void
  onDelete: (planId: string) => void
  onDeleteUnit: (planId: string, unitId: string) => void
}) {
  const { language } = useLanguage()
  const lang: 'en' | 'zh' = language === 'zh' ? 'zh' : 'en'
  const completedUnits = plan.units.filter((unit) => unit.is_completed).length

  return (
    <div className="card-new" style={{ marginBottom: 16, padding: 18 }}>
      {/* Section header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => onToggle(plan.id)}
            aria-label={collapsed ? (lang === 'zh' ? '展开' : 'Expand') : (lang === 'zh' ? '收起' : 'Collapse')}
            style={{ padding: '7px 9px' }}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
          <button
            type="button"
            onClick={() => onSelect(plan.id)}
            className="btn btn-sm btn-secondary"
            aria-label={selected ? (lang === 'zh' ? '取消选择' : 'Unselect') : (lang === 'zh' ? '选择' : 'Select')}
            style={{ padding: '7px 9px' }}
          >
            {selected ? <CheckSquare size={15} /> : <Square size={15} />}
          </button>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, minWidth: 0, flex: '1 1 220px' }}>
            {plan.title}
          </h2>
          <span className="chip" style={{ fontSize: 11 }}>
            {subjectLabel(plan.subject, lang)}
          </span>
          {plan.framework && (
            <span className="chip" style={{ fontSize: 11 }}>
              {frameworkLabel(plan.framework, lang)}
            </span>
          )}
          <span className="muted" style={{ fontSize: 12 }}>
            {completedUnits}/{plan.units.length}
          </span>
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
            {Math.round(plan.progress_percentage)}%
          </span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => onDelete(plan.id)}
            disabled={deleting}
            style={{ color: 'var(--color-danger, #dc2626)' }}
          >
            <Trash2 size={14} />
            {lang === 'zh' ? '删除' : 'Delete'}
          </button>
        </div>
        <div style={{ marginTop: 8 }}>
          <Progress value={plan.progress_percentage / 100} thin />
        </div>
      </div>

      {/* Units grid */}
      {!collapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" style={{ marginTop: 16 }}>
          {plan.units.length > 0 ? (
            plan.units.map((unit) => (
              <UnitCard
                key={unit.id}
                unit={unit}
                plan={plan}
                deleting={deletingUnitIds.has(unit.id)}
                onDelete={onDeleteUnit}
              />
            ))
          ) : (
            <div className="muted" style={{ fontSize: 13, padding: 12 }}>
              {lang === 'zh' ? '这个计划下暂无课程。' : 'No lessons in this plan.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---- Loading skeleton ----------------------------------------------------

function LibrarySkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="card-new p-4 flex flex-col gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Page ----------------------------------------------------------------

export default function LessonsPage() {
  const { language } = useLanguage()
  const { getToken, isSignedIn, isLoaded } = useAuth()
  const lang: 'en' | 'zh' = language === 'zh' ? 'zh' : 'en'

  const [plans, setPlans] = useState<StudyPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [unauthenticated, setUnauthenticated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [collapsedPlans, setCollapsedPlans] = useState<Set<string>>(new Set())
  const [selectedPlans, setSelectedPlans] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [deletingUnitIds, setDeletingUnitIds] = useState<Set<string>>(new Set())

  const fetchLibrary = useCallback(async (cancelledRef?: { current: boolean }) => {
      setLoading(true)
      setUnauthenticated(false)
      setError(null)
      try {
        if (!isSignedIn) {
          if (!cancelledRef?.current) setUnauthenticated(true)
          return
        }
        const token = await getToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetch('/api/backend/study-plan/library', {
          headers,
          cache: 'no-store',
        })
        if (res.status === 401) {
          if (!cancelledRef?.current) setUnauthenticated(true)
          return
        }
        const data: LibraryResponse = await res.json()
        if (!cancelledRef?.current) {
          setPlans(Array.isArray(data?.plans) ? data.plans : [])
          setSelectedPlans(new Set())
          if (!res.ok) {
            setError(
              lang === 'zh'
                ? `加载失败 (${res.status}): ${(data as any)?.detail || '请稍后重试'}`
                : `Failed to load library (${res.status}): ${(data as any)?.detail || 'Please try again later'}`
            )
          }
        }
      } catch (err: any) {
        if (!cancelledRef?.current) {
          setError(
            lang === 'zh'
              ? '无法连接到服务器，请检查网络后重试'
              : 'Could not connect to server. Please check your connection and try again.'
          )
        }
      } finally {
        if (!cancelledRef?.current) setLoading(false)
      }
  }, [getToken, isSignedIn, lang])

  useEffect(() => {
    if (!isLoaded) return
    const cancelledRef = { current: false }
    void fetchLibrary(cancelledRef)
    return () => { cancelledRef.current = true }
  }, [isLoaded, isSignedIn, fetchLibrary])

  const togglePlan = useCallback((planId: string) => {
    setCollapsedPlans((prev) => {
      const next = new Set(prev)
      if (next.has(planId)) next.delete(planId)
      else next.add(planId)
      return next
    })
  }, [])

  const toggleSelectedPlan = useCallback((planId: string) => {
    setSelectedPlans((prev) => {
      const next = new Set(prev)
      if (next.has(planId)) next.delete(planId)
      else next.add(planId)
      return next
    })
  }, [])

  const deleteOnePlan = useCallback(async (planId: string) => {
    const ok = window.confirm(lang === 'zh' ? '删除这个学习计划？30天后会自动清空。' : 'Delete this study plan? It will be cleared after 30 days.')
    if (!ok) return
    setDeleting(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`/api/backend/study-plan/${planId}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      setPlans((prev) => prev.filter((plan) => plan.id !== planId))
      setSelectedPlans((prev) => {
        const next = new Set(prev)
        next.delete(planId)
        return next
      })
    } catch (err: any) {
      setError(lang === 'zh' ? '删除失败，请重试。' : 'Delete failed. Please try again.')
    } finally {
      setDeleting(false)
    }
  }, [getToken, lang])

  const bulkDeletePlans = useCallback(async (deleteAll: boolean) => {
    const ids = deleteAll ? [] : Array.from(selectedPlans)
    const count = deleteAll ? plans.length : ids.length
    if (count === 0) return
    const ok = window.confirm(
      lang === 'zh'
        ? `删除 ${count} 个学习计划？30天后会自动清空。`
        : `Delete ${count} study plan${count === 1 ? '' : 's'}? They will be cleared after 30 days.`
    )
    if (!ok) return
    setDeleting(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch('/api/backend/study-plan/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ plan_ids: ids, delete_all: deleteAll }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail || `Delete failed (${res.status})`)
      const deletedIds = new Set<string>(Array.isArray(data?.plan_ids) ? data.plan_ids : ids)
      setPlans((prev) => deleteAll ? [] : prev.filter((plan) => !deletedIds.has(plan.id)))
      setSelectedPlans(new Set())
    } catch {
      setError(lang === 'zh' ? '删除失败，请重试。' : 'Delete failed. Please try again.')
    } finally {
      setDeleting(false)
    }
  }, [getToken, lang, plans.length, selectedPlans])

  const deleteOneUnit = useCallback(async (planId: string, unitId: string) => {
    const ok = window.confirm(lang === 'zh' ? '删除这个课程？30天后会自动清空。' : 'Delete this lesson? It will be cleared after 30 days.')
    if (!ok) return
    setDeletingUnitIds((prev) => new Set(prev).add(unitId))
    try {
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`/api/backend/study-plan/${planId}/unit/${unitId}`, { method: 'DELETE', headers })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail || `Delete failed (${res.status})`)
      setPlans((prev) => prev.map((plan) => {
        if (plan.id !== planId) return plan
        const units = plan.units.filter((unit) => unit.id !== unitId)
        return {
          ...plan,
          units,
          progress_percentage: typeof data?.plan?.progress_percentage === 'number'
            ? data.plan.progress_percentage
            : plan.progress_percentage,
          status: typeof data?.plan?.status === 'string' ? data.plan.status : plan.status,
        }
      }))
    } catch {
      setError(lang === 'zh' ? '课程删除失败，请重试。' : 'Lesson delete failed. Please try again.')
    } finally {
      setDeletingUnitIds((prev) => {
        const next = new Set(prev)
        next.delete(unitId)
        return next
      })
    }
  }, [getToken, lang])

  const selectedCount = selectedPlans.size
  const allSelected = plans.length > 0 && selectedCount === plans.length
  const allCollapsed = plans.length > 0 && plans.every((plan) => collapsedPlans.has(plan.id))

  if (!isLoaded || loading) return <LibrarySkeleton />

  if (unauthenticated) {
    return (
      <div>
        <PageHead
          eyebrow={lang === 'zh' ? '文库' : 'Library'}
          title={lang === 'zh' ? '你的学习库' : 'Your learning library'}
        />
        <div className="card-new" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>
            {lang === 'zh' ? '请登录查看你的学习库' : 'Sign in to see your library'}
          </div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            {lang === 'zh'
              ? '登录后即可查看你所有的学习计划和课程。'
              : 'Sign in to access all your study plans and lessons.'}
          </div>
          <Link href="/auth/login" className="btn btn-primary">
            {lang === 'zh' ? '登录' : 'Sign in'} <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    )
  }

  if (error && plans.length === 0) {
    return (
      <div>
        <PageHead
          eyebrow={lang === 'zh' ? '文库' : 'Library'}
          title={lang === 'zh' ? '你的学习库' : 'Your learning library'}
        />
        <div className="card-new" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 16, marginBottom: 8, color: 'var(--color-danger, #dc2626)' }}>
            {error}
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => { setError(null); setLoading(true); window.location.reload() }}
          >
            {lang === 'zh' ? '重试' : 'Retry'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHead
        eyebrow={lang === 'zh' ? '文库' : 'Library'}
        title={lang === 'zh' ? '你学过的一切' : "Everything you've learned"}
        kicker={
          lang === 'zh'
            ? '按学习计划整理的课程单元。可随时继续。'
            : 'Lesson units organised by study plan. Pick up where you left off.'
        }
      />

      {error && (
        <div
          className="card-new"
          style={{ padding: 12, marginBottom: 16, color: 'var(--color-danger, #dc2626)' }}
        >
          {error}
        </div>
      )}

      {plans.length === 0 ? (
        <div className="card-new" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>
            {lang === 'zh' ? '还没有学习计划' : 'No active study plans yet'}
          </div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            {lang === 'zh'
              ? '创建你的第一个学习计划，开始结构化学习。'
              : 'Create your first plan to start structured learning.'}
          </div>
          <Link href="/study-plan" className="btn btn-primary">
            {lang === 'zh' ? '创建第一个学习计划' : 'Create your first plan'}{' '}
            <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <>
          <div
            className="card-new"
            style={{
              padding: 12,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => {
                setSelectedPlans(allSelected ? new Set() : new Set(plans.map((plan) => plan.id)))
              }}
            >
              {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              {allSelected ? (lang === 'zh' ? '取消全选' : 'Unselect all') : (lang === 'zh' ? '全选' : 'Select all')}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => {
                setCollapsedPlans(allCollapsed ? new Set() : new Set(plans.map((plan) => plan.id)))
              }}
            >
              {allCollapsed ? <ChevronsDown size={14} /> : <ChevronsUp size={14} />}
              {allCollapsed ? (lang === 'zh' ? '全部展开' : 'Expand all') : (lang === 'zh' ? '全部收起' : 'Collapse all')}
            </button>
            <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
              {lang === 'zh' ? `${plans.length} 个计划` : `${plans.length} plans`}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => bulkDeletePlans(false)}
              disabled={selectedCount === 0 || deleting}
              style={{ color: selectedCount ? 'var(--color-danger, #dc2626)' : undefined }}
            >
              <Trash2 size={14} />
              {lang === 'zh' ? `删除所选${selectedCount ? `(${selectedCount})` : ''}` : `Delete selected${selectedCount ? ` (${selectedCount})` : ''}`}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => bulkDeletePlans(true)}
              disabled={plans.length === 0 || deleting}
              style={{ color: 'var(--color-danger, #dc2626)' }}
            >
              <Trash2 size={14} />
              {lang === 'zh' ? '全部删除' : 'Delete all'}
            </button>
          </div>

          {plans.map((plan) => (
            <PlanSection
              key={plan.id}
              plan={plan}
              collapsed={collapsedPlans.has(plan.id)}
              selected={selectedPlans.has(plan.id)}
              deleting={deleting}
              deletingUnitIds={deletingUnitIds}
              onToggle={togglePlan}
              onSelect={toggleSelectedPlan}
              onDelete={deleteOnePlan}
              onDeleteUnit={deleteOneUnit}
            />
          ))}
        </>
      )}
    </div>
  )
}
