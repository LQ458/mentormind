'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Home, Layers, Book, Settings, type LucideIcon } from 'lucide-react'
import { Progress } from './primitives'
import { useAuth, useUser } from '../AuthContext'
import { useLanguage } from '../LanguageContext'
import { getSubject } from '../../lib/subjects'

interface NavItem {
  href: string
  label: string
  zh: string
  icon: LucideIcon
  badge?: string
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Today', zh: '今日', icon: Home },
  { href: '/study-plan', label: 'Study plan', zh: '学习计划', icon: Layers },
  { href: '/lessons', label: 'Library', zh: '文库', icon: Book },
]

interface MyPlan {
  id: string
  subject: string
  progress_percentage: number
  status: string
  updated_at: string | null
}

interface SubjectRow {
  key: string
  label: string
  pct: number
  active: boolean
}

function aggregateSubjects(plans: MyPlan[], lang: 'en' | 'zh'): SubjectRow[] {
  if (plans.length === 0) return []
  const groups: Record<string, { total: number; count: number; latest: string }> = {}
  for (const p of plans) {
    if (!p.subject) continue
    const cur = groups[p.subject] ?? { total: 0, count: 0, latest: '' }
    cur.total += Number(p.progress_percentage) || 0
    cur.count += 1
    if (p.updated_at && p.updated_at > cur.latest) cur.latest = p.updated_at
    groups[p.subject] = cur
  }
  const keys = Object.keys(groups)
  if (keys.length === 0) return []

  let mostRecentKey: string | null = null
  let mostRecentTs = ''
  for (const k of keys) {
    if (groups[k].latest > mostRecentTs) {
      mostRecentTs = groups[k].latest
      mostRecentKey = k
    }
  }

  const rows: SubjectRow[] = keys.map((k) => {
    const v = groups[k]
    const meta = getSubject(k)
    const label = meta ? (lang === 'zh' ? meta.labelZh : meta.label) : k
    return {
      key: k,
      label,
      pct: Math.round(v.total / v.count),
      active: k === mostRecentKey,
    }
  })
  rows.sort((a, b) => (a.active === b.active ? b.pct - a.pct : a.active ? -1 : 1))
  return rows
}

export default function Sidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname() || ''
  const { user } = useUser()
  const { getToken, isSignedIn, isLoaded } = useAuth()
  const { language } = useLanguage()
  const lang = language === 'zh' ? 'zh' : 'en'

  const [plans, setPlans] = useState<MyPlan[]>([])
  const [plansLoaded, setPlansLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!isLoaded) return
      if (!isSignedIn) {
        setPlansLoaded(true)
        return
      }
      try {
        const token = await getToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetch('/api/backend/study-plan/my-plans', {
          headers,
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        setPlans(Array.isArray(data?.plans) ? data.plans : [])
      } catch {
        if (!cancelled) setPlans([])
      } finally {
        if (!cancelled) setPlansLoaded(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn, getToken])

  const subjectRows = useMemo(() => aggregateSubjects(plans, lang), [plans, lang])

  const initial = (user?.firstName?.[0] || user?.username?.[0] || 'M').toUpperCase()
  const displayName = user?.fullName || user?.username || 'Guest'
  const role = 'Learner'

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    if (href === '/lessons') return pathname.startsWith('/lessons')
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <div className={`sidebar${mobileOpen ? ' sidebar--mobile-open' : ''}`}>
      <Link href="/dashboard" className="sb-brand">
        <div className="glyph">M</div>
        <div className="wordmark">
          {lang === 'zh' ? '导师' : 'MentorMind'}
        </div>
      </Link>

      <div className="sb-section">
        {NAV.map((n) => {
          const Icon = n.icon
          const active = isActive(n.href)
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={`sb-item ${active ? 'active' : ''}`}
            >
              <Icon size={18} strokeWidth={1.6} className="sb-icon" />
              <span>{lang === 'zh' ? n.zh : n.label}</span>
              {n.badge && <span className="badge">{n.badge}</span>}
            </Link>
          )
        })}
      </div>

      {plansLoaded && subjectRows.length > 0 && (
        <div className="sb-section">
          <div className="sb-head">{lang === 'zh' ? '你的学科' : 'Your subjects'}</div>
          {subjectRows.map((s) => (
            <div
              key={s.key}
              className="sb-item"
              style={{
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 6,
                padding: '10px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ fontWeight: s.active ? 500 : 400 }}>{s.label}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {s.pct}%
                </span>
              </div>
              <Progress value={s.pct / 100} thin strong={s.active} />
            </div>
          ))}
        </div>
      )}

      <Link href="/settings" className="sb-user">
        <div className="avatar">{initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName}
          </div>
          <div className="role">{role}</div>
        </div>
        <Settings size={16} />
      </Link>
    </div>
  )
}
