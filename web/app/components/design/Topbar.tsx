'use client'

import { usePathname } from 'next/navigation'
import { Search, Menu, MessageSquare } from 'lucide-react'
import { useLanguage } from '../LanguageContext'
import { useUser, useAuth } from '../AuthContext'
import NotificationsPanel from '../NotificationsPanel'
import { openCommandPalette } from '../CommandPalette'
import { openFeedback } from '../feedbackEvents'
import { track } from '../../lib/telemetry'

interface PageMeta {
  en: string
  zh: string
}

const PAGE_META: Record<string, PageMeta> = {
  '/dashboard': { en: 'Today', zh: '今日' },
  '/today': { en: 'Daily review', zh: '每日复习' },
  '/study-plan': { en: 'Study plan', zh: '学习计划' },
  '/ask': { en: 'Quick question', zh: '快速提问' },
  '/seminar': { en: 'Seminar', zh: '研讨' },
  '/lessons': { en: 'Library', zh: '文库' },
}

function getPageMeta(pathname: string): PageMeta {
  if (PAGE_META[pathname]) return PAGE_META[pathname]
  if (pathname.startsWith('/lessons/')) return { en: 'Lesson', zh: '课' }
  if (pathname.startsWith('/study-plan/')) return { en: 'Study plan', zh: '学习计划' }
  if (pathname.startsWith('/admin')) return { en: 'Admin', zh: '管理' }
  if (pathname.startsWith('/analytics')) return { en: 'Analytics', zh: '分析' }
  if (pathname.startsWith('/settings')) return { en: 'Settings', zh: '设置' }
  if (pathname.startsWith('/principles')) return { en: 'Principles', zh: '原则' }
  if (pathname.startsWith('/auth')) return { en: 'Sign in', zh: '登录' }
  return { en: 'MentorMind', zh: '导师' }
}

export default function Topbar({ onMenuClick, menuOpen = false }: { onMenuClick?: () => void; menuOpen?: boolean }) {
  const pathname = usePathname() || '/'
  const { language, setLanguage } = useLanguage()
  const { user, isLoaded } = useUser()
  const { isSignedIn, signOut } = useAuth()

  const meta = getPageMeta(pathname)
  const initial = (user?.firstName?.[0] || user?.username?.[0] || 'M').toUpperCase()

  return (
    <div className="topbar">
      <button
        type="button"
        className="md:hidden p-1.5 -ml-1 rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="app-sidebar"
        onClick={onMenuClick}
      >
        <Menu size={20} />
      </button>
      <div className="page-title">
        {language === 'zh' ? meta.zh : meta.en}
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

      <button
        type="button"
        className="icon-btn"
        aria-label={language === 'zh' ? '发送反馈' : 'Send feedback'}
        onClick={() => {
          track('feedback_click', { source: 'topbar_feedback_icon', surface: 'topbar' })
          openFeedback({
            surface: 'topbar',
            snapshot: { page_title: language === 'zh' ? meta.zh : meta.en },
          })
        }}
      >
        <MessageSquare size={18} />
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

      {isLoaded && isSignedIn && (
        <button className="avatar-btn" type="button" aria-label="Account">
          {initial}
        </button>
      )}
      {isLoaded && !isSignedIn && (
        <a href="/auth/login" className="btn btn-sm btn-primary no-underline">
          {language === 'zh' ? '登录' : 'Sign in'}
        </a>
      )}
    </div>
  )
}
