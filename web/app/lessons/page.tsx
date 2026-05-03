'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '@clerk/nextjs'
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react'
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
  units: PlanUnit[]
}

interface LibraryResponse {
  success: boolean
  plans: StudyPlan[]
}

// ---- Helpers -------------------------------------------------------------

function statusKind(status: string): 'ok' | 'accent' | 'warn' | '' {
  if (status === 'completed') return 'ok'
  if (status === 'in_progress') return 'accent'
  return ''
}

function statusLabel(status: string, lang: 'en' | 'zh'): string {
  if (lang === 'zh') {
    if (status === 'completed') return '已完成'
    if (status === 'in_progress') return '进行中'
    if (status === 'not_started') return '未开始'
    return status
  }
  if (status === 'completed') return 'Completed'
  if (status === 'in_progress') return 'In progress'
  if (status === 'not_started') return 'Not started'
  return status
}

// ---- Unit Card -----------------------------------------------------------

function UnitCard({ unit, plan }: { unit: PlanUnit; plan: StudyPlan }) {
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
      {unit.board_session_id ? (
        <Link
          href={`/board/${unit.board_session_id}`}
          className="btn btn-sm btn-primary"
          style={{ marginTop: 'auto', textAlign: 'center' }}
        >
          {lang === 'zh' ? '继续学习' : 'Resume'} <ArrowRight size={13} />
        </Link>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          style={{ marginTop: 'auto' }}
          onClick={handleStart}
          disabled={starting}
        >
          {starting
            ? lang === 'zh' ? '准备中…' : 'Starting…'
            : lang === 'zh' ? '开始学习' : 'Start lesson'}
          {!starting && <ArrowRight size={13} />}
        </button>
      )}
    </div>
  )
}

// ---- Plan Section --------------------------------------------------------

function PlanSection({ plan }: { plan: StudyPlan }) {
  const { language } = useLanguage()
  const lang: 'en' | 'zh' = language === 'zh' ? 'zh' : 'en'

  return (
    <div style={{ marginBottom: 40 }}>
      {/* Section header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{plan.title}</h2>
          <span className="chip" style={{ fontSize: 11 }}>
            {plan.subject}
          </span>
          {plan.framework && (
            <span className="chip" style={{ fontSize: 11 }}>
              {plan.framework}
            </span>
          )}
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
            {plan.progress_percentage}%
          </span>
        </div>
        <div style={{ marginTop: 8 }}>
          <Progress value={plan.progress_percentage / 100} thin />
        </div>
      </div>

      {/* Units grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plan.units.map((unit) => (
          <UnitCard key={unit.id} unit={unit} plan={plan} />
        ))}
      </div>
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

  useEffect(() => {
    if (!isLoaded) return
    let cancelled = false

    const fetchLibrary = async () => {
      setLoading(true)
      try {
        const token = await getToken()
        if (!token) {
          if (!cancelled) setUnauthenticated(true)
          return
        }
        const res = await fetch('/api/backend/study-plan/library', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        if (res.status === 401) {
          if (!cancelled) setUnauthenticated(true)
          return
        }
        const data: LibraryResponse = await res.json()
        if (!cancelled) {
          setPlans(Array.isArray(data?.plans) ? data.plans : [])
        }
      } catch {
        if (!cancelled) setPlans([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchLibrary()
    return () => { cancelled = true }
  }, [isLoaded, isSignedIn, getToken])

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
        plans.map((plan) => <PlanSection key={plan.id} plan={plan} />)
      )}
    </div>
  )
}
