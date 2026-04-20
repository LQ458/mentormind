'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLanguage } from '../components/LanguageContext'
import { useAuth, useUser } from '@clerk/nextjs'
import { Play, Flame, Clock, Sparkles, ArrowRight } from 'lucide-react'

import { PageHead, Section, Progress, Chip } from '../components/design/primitives'

interface ReviewQueueItem {
  id: number
  review_type: string
  stage: 'due_now' | 'upcoming'
  due_in_hours: number
  due_at: string
  lesson: {
    id: string
    title: string
    topic: string
    duration_minutes: number
  }
  metadata?: {
    trigger?: string
    mastery?: number
  }
}

interface ProactiveNotification {
  id: number
  notification_type: string
  title: string
  body?: string | null
  action_url?: string | null
}

interface RecentLesson {
  id: string
  timestamp: string
  query: string
  lesson_title: string
  quality_score: number
  cost_usd: number
}

export default function DashboardPage() {
  const { language } = useLanguage()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const { user } = useUser()

  const [recentLessons, setRecentLessons] = useState<RecentLesson[]>([])
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([])
  const [notifications, setNotifications] = useState<ProactiveNotification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchRecentLessons(), fetchReviewQueue(), fetchNotifications()]).finally(
      () => setLoading(false),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn])

  const fetchRecentLessons = async () => {
    try {
      const endpoint = isSignedIn ? '/api/backend/users/me/lessons' : '/api/backend/results'
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(endpoint, { headers })
      const data = await response.json()
      const rawLessons = Array.isArray(data) ? data : data.results || []
      const normalized: RecentLesson[] = rawLessons.map((lesson: any) => ({
        id: lesson.id,
        timestamp: lesson.timestamp || lesson.created_at,
        query: lesson.query || lesson.topic,
        lesson_title: lesson.lesson_title || lesson.title,
        quality_score: lesson.quality_score || 0,
        cost_usd: lesson.cost_usd || 0,
      }))
      setRecentLessons(normalized)
    } catch (error) {
      console.error('Failed to fetch lessons:', error)
    }
  }

  const fetchReviewQueue = async () => {
    if (!isLoaded || !isSignedIn) {
      setReviewQueue([])
      return
    }
    try {
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch('/api/backend/users/me/review-queue', { headers })
      if (!response.ok) throw new Error(`Failed: ${response.status}`)
      const data = await response.json()
      setReviewQueue(data.items || [])
    } catch (error) {
      console.error('Failed to fetch review queue:', error)
    }
  }

  const fetchNotifications = async () => {
    if (!isLoaded || !isSignedIn) {
      setNotifications([])
      return
    }
    try {
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(
        '/api/backend/users/me/notifications?unread_only=true&limit=4',
        { headers },
      )
      if (!response.ok) throw new Error(`Failed: ${response.status}`)
      const data = await response.json()
      setNotifications(data.items || [])
    } catch (error) {
      console.error('Failed to fetch notifications:', error)
    }
  }

  const firstName = user?.firstName || (language === 'zh' ? '同学' : 'there')

  // Pick today's focus from the first due review, or fall back to a placeholder
  const focusReview = reviewQueue.find((r) => r.stage === 'due_now') || reviewQueue[0]
  const focusTitle =
    focusReview?.lesson?.title ||
    (language === 'zh' ? '从你昨天差点理解的地方继续' : 'Pick up where you almost understood')
  const focusTopic = focusReview?.lesson?.topic || (language === 'zh' ? '今日学习' : 'Today')

  // Stats — derive from data or sensible placeholders
  const completedCount = recentLessons.length
  const goalMin = 60
  const todayMin = Math.min(goalMin, completedCount * 8) // rough placeholder
  const masteryPct = Math.round(
    Math.min(
      1,
      recentLessons.reduce((a, l) => a + (l.quality_score || 0), 0) / Math.max(1, recentLessons.length),
    ) * 100,
  )

  const dateLine = new Date().toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const hour = new Date().getHours()
  const greeting =
    language === 'zh'
      ? hour < 5
        ? '夜深了'
        : hour < 12
        ? '早上好'
        : hour < 18
        ? '下午好'
        : '晚上好'
      : hour < 5
      ? 'Still up'
      : hour < 12
      ? 'Good morning'
      : hour < 18
      ? 'Good afternoon'
      : 'Good evening'

  if (!isLoaded || loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 240 }}>
        <div className="muted">{language === 'zh' ? '加载中…' : 'Loading…'}</div>
      </div>
    )
  }

  return (
    <div>
      <PageHead
        eyebrow={dateLine}
        title={language === 'zh' ? `${greeting}，${firstName}` : `${greeting}, ${firstName}`}
        zh={language === 'zh' ? '今日' : greeting === 'Good morning' ? '早上好' : greeting === 'Good afternoon' ? '下午好' : greeting === 'Good evening' ? '晚上好' : '夜深了'}
        kicker={
          language === 'zh'
            ? '从昨天差点理解的地方继续。一项专注，几次复习，把循环闭合。'
            : 'Pick up where you almost-understood yesterday. One focus today, a few reviews to close the loop.'
        }
      />

      {/* Hero focus card */}
      <div className="card-new" style={{ padding: 28, borderColor: 'var(--line-strong)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Chip kind="accent" dot>
            {language === 'zh' ? '今日重点' : "Today's focus"}
          </Chip>
          <span className="muted" style={{ fontSize: 12 }}>
            {focusTopic}
          </span>
        </div>
        <h2
          style={{
            fontFamily: 'var(--display)',
            fontSize: 30,
            fontWeight: 400,
            letterSpacing: '-0.01em',
            margin: '0 0 20px',
            lineHeight: 1.15,
          }}
        >
          {focusTitle}
        </h2>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {focusReview ? (
            <Link
              href={`/lessons/${focusReview.lesson.id}`}
              className="btn btn-primary btn-lg"
            >
              <Play size={16} /> {language === 'zh' ? '开始这节' : 'Begin lesson'}
            </Link>
          ) : (
            <Link href="/create" className="btn btn-primary btn-lg">
              <Sparkles size={16} /> {language === 'zh' ? '创建新课程' : 'Create a lesson'}
            </Link>
          )}
          <Link href="/create" className="btn btn-lg">
            {language === 'zh' ? '调整并重做' : 'Adjust & recreate'}
          </Link>
        </div>
      </div>

      {/* Stat strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
          marginTop: 20,
        }}
      >
        {[
          {
            Icon: Flame,
            label: language === 'zh' ? '连续' : 'Streak',
            v: language === 'zh' ? `${completedCount} 天` : `${completedCount} days`,
            sub: language === 'zh' ? '保持势头' : 'Keep going',
          },
          {
            Icon: Clock,
            label: language === 'zh' ? '今日' : 'Today',
            v: `${todayMin} min`,
            sub: language === 'zh' ? `目标 ${goalMin}` : `Goal ${goalMin}`,
          },
          {
            Icon: Sparkles,
            label: language === 'zh' ? '掌握度' : 'Mastery',
            v: `${masteryPct}%`,
            sub: language === 'zh' ? '本周累计' : 'This week',
          },
        ].map((s) => (
          <div key={s.label} className="card-new" style={{ padding: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--ink-muted)',
                marginBottom: 8,
              }}
            >
              <s.Icon size={14} />
              <span style={{ fontSize: 12 }}>{s.label}</span>
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, letterSpacing: '-0.005em' }}>
              {s.v}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Reviews */}
      <Section
        title={language === 'zh' ? '复习' : 'Reviews'}
        zh={language === 'zh' ? 'Reviews' : '复习'}
        tools={
          <Link href="/lessons" style={{ color: 'var(--accent)', fontWeight: 500 }}>
            {language === 'zh' ? '查看全部' : 'See all'}
          </Link>
        }
      >
        {reviewQueue.length > 0 ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {reviewQueue.slice(0, 3).map((r) => {
              const mastery = r.metadata?.mastery ?? 0.5
              const whenLabel =
                r.stage === 'due_now'
                  ? language === 'zh'
                    ? '现在最适合'
                    : 'due now'
                  : `${Math.max(1, Math.round(r.due_in_hours))}h`
              return (
                <Link
                  key={r.id}
                  href={`/lessons/${r.lesson.id}`}
                  className="card-new hover"
                  style={{
                    padding: 16,
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 20,
                    alignItems: 'center',
                    cursor: 'pointer',
                    color: 'inherit',
                    textDecoration: 'none',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <Chip>{r.lesson.topic || (language === 'zh' ? '复习' : 'Review')}</Chip>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {whenLabel}
                      </span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>
                      {r.lesson.title}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ width: 120 }}>
                        <Progress value={mastery} thin />
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {Math.round(mastery * 100)}% {language === 'zh' ? '掌握' : 'mastered'}
                      </span>
                    </div>
                  </div>
                  <ArrowRight size={18} />
                </Link>
              )
            })}
          </div>
        ) : (
          <div
            className="card-new"
            style={{ padding: 24, textAlign: 'center' }}
          >
            <div className="muted" style={{ fontSize: 14 }}>
              {language === 'zh'
                ? '完成一节课程后，复习挑战会自动出现在这里。'
                : 'Once you finish a lesson, review challenges will surface here.'}
            </div>
          </div>
        )}
      </Section>

      {/* Mentor note */}
      <Section title={language === 'zh' ? '导师留言' : 'From your mentor'}>
        <div
          className="card-new"
          style={{
            padding: 20,
            background: 'var(--accent-soft)',
            borderColor: 'transparent',
          }}
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: 'var(--accent)',
                color: 'white',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Sparkles size={18} />
            </div>
            <div style={{ flex: 1 }}>
              {notifications.length > 0 ? (
                <>
                  <div
                    style={{
                      fontSize: 15,
                      lineHeight: 1.5,
                      color: 'var(--ink)',
                      marginBottom: 6,
                    }}
                  >
                    <strong>{notifications[0].title}</strong>
                  </div>
                  {notifications[0].body && (
                    <div className="muted" style={{ fontSize: 13 }}>
                      {notifications[0].body}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {notifications[0].action_url && (
                      <Link
                        href={notifications[0].action_url}
                        className="btn btn-primary btn-sm"
                      >
                        {language === 'zh' ? '现在打开' : 'Open now'}
                      </Link>
                    )}
                    <button className="btn btn-ghost btn-sm" type="button" onClick={fetchNotifications}>
                      {language === 'zh' ? '刷新' : 'Refresh'}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink)' }}>
                  {language === 'zh'
                    ? '继续学习，导师的复习提醒会自动出现在这里。'
                    : 'Keep learning — proactive review nudges will appear here as patterns emerge.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* Recent lessons */}
      {recentLessons.length > 0 && (
        <Section
          title={language === 'zh' ? '最近的课程' : 'Recent lessons'}
          tools={
            <Link href="/lessons" style={{ color: 'var(--accent)', fontWeight: 500 }}>
              {language === 'zh' ? '查看全部' : 'See all'}
            </Link>
          }
        >
          <div style={{ display: 'grid', gap: 10 }}>
            {recentLessons.slice(0, 4).map((l) => (
              <Link
                key={l.id}
                href={`/lessons/${l.id}`}
                className="card-new hover"
                style={{
                  padding: 14,
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  color: 'inherit',
                  textDecoration: 'none',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                    {l.lesson_title}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {new Date(l.timestamp).toLocaleDateString(
                      language === 'zh' ? 'zh-CN' : 'en-US',
                    )}
                  </div>
                </div>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
