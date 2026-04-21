'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Plus, Layers, Book, Settings, type LucideIcon } from 'lucide-react'
import { Progress } from './primitives'
import { useUser } from '@clerk/nextjs'

interface NavItem {
  href: string
  label: string
  zh: string
  icon: LucideIcon
  badge?: string
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Today', zh: '今日', icon: Home },
  { href: '/create', label: 'Create', zh: '创建', icon: Plus },
  { href: '/study-plan', label: 'Study plan', zh: '学习计划', icon: Layers },
  { href: '/lessons', label: 'Library', zh: '文库', icon: Book },
]

export default function Sidebar() {
  const pathname = usePathname() || ''
  const { user } = useUser()

  const initial = (user?.firstName?.[0] || user?.username?.[0] || 'M').toUpperCase()
  const displayName = user?.fullName || user?.username || 'Guest'
  const role = 'Learner'

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/'
    if (href === '/lessons') return pathname.startsWith('/lessons')
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <div className="sidebar">
      <Link href="/dashboard" className="sb-brand">
        <div className="glyph">M</div>
        <div className="wordmark">
          MentorMind<span className="zh">导师</span>
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
              <span>{n.label}</span>
              {n.badge && <span className="badge">{n.badge}</span>}
            </Link>
          )
        })}
      </div>

      <div className="sb-section">
        <div className="sb-head">Your subjects</div>
        {/* TODO: replace placeholder subjects with data from /api/user/subjects */}
        {[
          { k: 'Mathematics', pct: 37, active: true },
          { k: 'Physics', pct: 18 },
          { k: 'English', pct: 54 },
        ].map((s) => (
          <div
            key={s.k}
            className="sb-item"
            style={{
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 6,
              padding: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ fontWeight: s.active ? 500 : 400 }}>{s.k}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {s.pct}%
              </span>
            </div>
            <Progress value={s.pct / 100} thin strong={s.active} />
          </div>
        ))}
      </div>

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
