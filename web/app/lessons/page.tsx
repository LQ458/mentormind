'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '@clerk/nextjs'
import { ArrowRight } from 'lucide-react'
import { PageHead, Progress, Chip } from '../components/design/primitives'

interface Lesson {
  id: string
  timestamp: string
  query: string
  lesson_title: string
  quality_score: number
  cost_usd: number
}

type FilterKey = 'all' | 'lesson' | 'note' | 'deck'

export default function LessonsPage() {
  const { language, t } = useLanguage()
  const { getToken, isSignedIn } = useAuth()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')

  useEffect(() => {
    fetchLessons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchLessons = async () => {
    try {
      const endpoint = isSignedIn ? '/api/backend/users/me/lessons' : '/api/backend/results'
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(endpoint, { headers })
      const data = await response.json()
      const rawLessons = Array.isArray(data) ? data : data.results || []
      setLessons(
        rawLessons.map((lesson: any) => ({
          id: lesson.id,
          timestamp: lesson.timestamp || lesson.created_at,
          query: lesson.query || lesson.topic,
          lesson_title: lesson.lesson_title || lesson.title,
          quality_score: lesson.quality_score || 0,
          cost_usd: lesson.cost_usd || 0,
        })),
      )
    } catch (error) {
      console.error('Failed to fetch lessons:', error)
    } finally {
      setLoading(false)
    }
  }

  // For now everything we have is a "lesson" kind. Filter UI is wired but only "all" / "lesson" yield results.
  const filtered =
    filter === 'all' ? lessons : filter === 'lesson' ? lessons : []

  const filters: { id: FilterKey; t: string; n: number }[] = [
    { id: 'all', t: language === 'zh' ? '全部' : 'All', n: lessons.length },
    { id: 'lesson', t: language === 'zh' ? '课程' : 'Lessons', n: lessons.length },
    { id: 'note', t: language === 'zh' ? '笔记' : 'Notes', n: 0 },
    { id: 'deck', t: language === 'zh' ? '卡片' : 'Flashcards', n: 0 },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 240 }}>
        <div className="muted">{t('lessons.loading')}</div>
      </div>
    )
  }

  return (
    <div>
      <PageHead
        eyebrow={language === 'zh' ? '文库' : 'Library'}
        title={language === 'zh' ? '你学过的一切' : "Everything you've learned"}
        zh={language === 'zh' ? 'Library' : '文库'}
        kicker={
          language === 'zh'
            ? '你生成的课程、笔记和卡片。可搜索、可重温。'
            : "Lessons, notes, and flashcards you've generated. Searchable, revisitable."
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`btn btn-sm ${filter === f.id ? 'btn-primary' : ''}`}
            type="button"
          >
            {f.t} <span style={{ opacity: 0.7 }}>{f.n}</span>
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {filtered.map((i) => {
            const mastery = i.quality_score
            const kind: 'ok' | 'accent' | 'warn' =
              mastery >= 0.7 ? 'ok' : mastery >= 0.4 ? 'accent' : 'warn'
            return (
              <Link
                key={i.id}
                href={`/lessons/${i.id}`}
                className="card-new hover"
                style={{
                  padding: 18,
                  cursor: 'pointer',
                  color: 'inherit',
                  textDecoration: 'none',
                  display: 'block',
                }}
              >
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                  <Chip kind={kind} dot>
                    {language === 'zh' ? '课程' : 'lesson'}
                  </Chip>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                    {new Date(i.timestamp).toLocaleDateString(
                      language === 'zh' ? 'zh-CN' : 'en-US',
                    )}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    marginBottom: 4,
                    lineHeight: 1.3,
                    minHeight: 39,
                  }}
                >
                  {i.lesson_title}
                </div>
                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    marginBottom: 14,
                    minHeight: 32,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {i.query}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <Progress value={mastery} thin />
                  </div>
                  <span className="muted" style={{ fontSize: 11 }}>
                    {Math.round(mastery * 100)}%
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="card-new" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>
            {language === 'zh' ? '还没有课程' : 'No lessons yet'}
          </div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
            {language === 'zh'
              ? '从一个你想理解的概念开始。'
              : 'Start from a concept you want to understand.'}
          </div>
          <Link href="/create" className="btn btn-primary">
            {language === 'zh' ? '创建第一节课' : 'Create your first lesson'}{' '}
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  )
}
