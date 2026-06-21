'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, BookOpen, Share2 } from 'lucide-react'

interface SharedSession {
  id: string
  title: string
  topic?: string | null
  status?: string | null
  updated_at?: string | null
  element_count: number
  summary_markdown?: string
}

export default function BoardSharePage() {
  const params = useParams()
  const sessionId = params?.sessionId as string
  const [session, setSession] = useState<SharedSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const token = new URLSearchParams(window.location.search).get('token') || ''
        if (!token) {
          setError('Missing share token.')
          return
        }
        const res = await fetch(
          `/api/backend/board/session/${sessionId}/share?token=${encodeURIComponent(token)}`,
          { cache: 'no-store' },
        )
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || !data.success) {
          setError('This share link is unavailable.')
          return
        }
        setSession(data.session)
      } catch (err) {
        console.error('Board share load error:', err)
        if (!cancelled) setError('Share link failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (sessionId) void load()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-5 py-10">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--accent)] text-white">
            <Share2 size={18} />
          </div>
          <div>
            <div className="text-sm font-medium text-[var(--ink-muted)]">MentorMind</div>
            <h1 className="font-serif text-3xl font-normal leading-tight">Shared board lesson</h1>
          </div>
        </div>

        {loading && (
          <div className="card-new p-6">
            <div className="h-4 w-28 animate-pulse rounded bg-[var(--surface-3)]" />
            <div className="mt-4 h-8 w-2/3 animate-pulse rounded bg-[var(--surface-3)]" />
            <div className="mt-6 h-24 animate-pulse rounded bg-[var(--surface-2)]" />
          </div>
        )}

        {!loading && error && (
          <div className="card-new p-6">
            <h2 className="mb-2 text-lg font-semibold">Link unavailable</h2>
            <p className="text-[var(--ink-muted)]">{error}</p>
            <Link href="/" className="btn btn-primary mt-5 inline-flex">
              Open MentorMind
            </Link>
          </div>
        )}

        {!loading && session && (
          <div className="card-new p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-[var(--ink-muted)]">
              <BookOpen size={15} />
              <span>{session.topic || 'Board lesson'}</span>
              <span>{session.element_count} board elements</span>
            </div>
            <h2 className="mb-4 font-serif text-4xl font-normal leading-tight">
              {session.title}
            </h2>
            {session.summary_markdown ? (
              <p className="whitespace-pre-line text-base leading-7 text-[var(--ink-2)]">
                {session.summary_markdown}
              </p>
            ) : (
              <p className="text-base leading-7 text-[var(--ink-2)]">
                This lesson has been shared from a live board session. Open MentorMind to
                build your own adaptive lesson and daily study plan.
              </p>
            )}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/" className="btn btn-primary">
                Start your plan <ArrowRight size={16} />
              </Link>
              <Link href="/today" className="btn">
                See daily review
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
