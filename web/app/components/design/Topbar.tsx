'use client'

import { usePathname } from 'next/navigation'
import { Search } from 'lucide-react'
import { useLanguage } from '../LanguageContext'
import { useUser, SignInButton, SignedIn, SignedOut } from '@clerk/nextjs'
import NotificationsPanel from '../NotificationsPanel'
import { openCommandPalette } from '../CommandPalette'

interface PageMeta {
  label: string
  zh: string
}

const PAGE_META: Record<string, PageMeta> = {
  '/dashboard': { label: 'Today', zh: '今日' },
  '/create': { label: 'Create', zh: '创建' },
  '/study-plan': { label: 'Study plan', zh: '学习计划' },
  '/lessons': { label: 'Library', zh: '文库' },
}

function getPageMeta(pathname: string): PageMeta {
  // exact match first
  if (PAGE_META[pathname]) return PAGE_META[pathname]
  // lesson detail
  if (pathname.startsWith('/lessons/')) return { label: 'Lesson', zh: '课' }
  if (pathname.startsWith('/study-plan/')) return { label: 'Study plan', zh: '学习计划' }
  // fallbacks
  if (pathname.startsWith('/admin')) return { label: 'Admin', zh: '管理' }
  if (pathname.startsWith('/analytics')) return { label: 'Analytics', zh: '分析' }
  if (pathname.startsWith('/settings')) return { label: 'Settings', zh: '设置' }
  if (pathname.startsWith('/principles')) return { label: 'Principles', zh: '原则' }
  if (pathname.startsWith('/auth')) return { label: 'Sign in', zh: '登录' }
  return { label: 'MentorMind', zh: '导师' }
}

export default function Topbar() {
  const pathname = usePathname() || '/'
  const { language, setLanguage } = useLanguage()
  const { user } = useUser()

  const meta = getPageMeta(pathname)
  const initial = (user?.firstName?.[0] || user?.username?.[0] || 'M').toUpperCase()

  return (
    <div className="topbar">
      <div className="page-title">
        {meta.label}
        <span className="zh">{meta.zh}</span>
      </div>

      <button
        type="button"
        className="search-pill"
        onClick={openCommandPalette}
        aria-label={language === 'zh' ? '搜索（按 Cmd+K）' : 'Search (Cmd+K)'}
      >
        <Search size={16} aria-hidden="true" />
        <span style={{ flex: 1, textAlign: 'left', color: 'var(--ink-muted)', fontSize: 13 }}>
          {language === 'zh' ? '搜索课程、计划、操作…' : 'Search lessons, plans, actions…'}
        </span>
        <kbd
          aria-hidden="true"
          style={{
            fontFamily: 'var(--mono, IBM Plex Mono, monospace)',
            fontSize: 11,
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid var(--line-strong, #d4d9e2)',
            color: 'var(--ink-muted)',
            background: 'var(--surface, #fff)',
          }}
        >
          ⌘K
        </kbd>
      </button>

      <div className="lang-toggle" role="group" aria-label="Language">
        <button
          type="button"
          className={language === 'en' ? 'on' : ''}
          onClick={() => setLanguage('en')}
        >
          EN
        </button>
        <button
          type="button"
          className={language === 'zh' ? 'on' : ''}
          onClick={() => setLanguage('zh')}
        >
          中文
        </button>
      </div>

      <NotificationsPanel />

      <SignedIn>
        <button className="avatar-btn" type="button" aria-label="Account">
          {initial}
        </button>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <button className="btn btn-sm btn-primary" type="button">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
    </div>
  )
}
