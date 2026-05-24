'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthContext'
import { Search, Home, BookOpen, BarChart3, Settings, Compass, GraduationCap, Sparkles, Network } from 'lucide-react'
import { useLanguage } from './LanguageContext'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface Hit {
  id: string
  title: string
  subtitle?: string
  group: 'nav' | 'lesson' | 'plan' | 'help'
  href: string
  icon?: React.ReactNode
  keywords?: string
}

interface NavEntry {
  href: string
  zh: string
  en: string
  hint_zh?: string
  hint_en?: string
  icon: React.ReactNode
}

const NAV: NavEntry[] = [
  { href: '/dashboard', zh: '今日仪表盘', en: 'Dashboard', hint_zh: '今日学习焦点 + 复习', hint_en: "Today's focus + reviews", icon: <Home size={16} /> },
  { href: '/lessons', zh: '课程库', en: 'Library', hint_zh: '已生成的所有课程', hint_en: 'All generated lessons', icon: <BookOpen size={16} /> },
  { href: '/knowledge-graph', zh: '学习地图', en: 'Knowledge map', hint_zh: '从已学课程自动构建的概念图谱', hint_en: 'Concept graph built from your finished lessons', icon: <Network size={16} /> },
  { href: '/study-plan', zh: '学习计划', en: 'Study plans', hint_zh: '多周备考路线', hint_en: 'Multi-week study tracks', icon: <Compass size={16} /> },
  { href: '/gaokao', zh: '高考专项', en: 'Gaokao prep', hint_zh: '中国高考备考工具', hint_en: 'Chinese college entrance exam', icon: <GraduationCap size={16} /> },
  { href: '/analytics', zh: '使用分析', en: 'Analytics', hint_zh: '学习时长、质量、成本', hint_en: 'Time, quality, cost', icon: <BarChart3 size={16} /> },
  { href: '/settings', zh: '设置', en: 'Settings', hint_zh: '订阅 / 偏好 / 计费', hint_en: 'Subscription / preferences', icon: <Settings size={16} /> },
  { href: '/principles', zh: '产品理念', en: 'Principles', hint_zh: '平台设计原则', hint_en: 'Design principles', icon: <Sparkles size={16} /> },
]

interface LessonRow {
  id: string
  lesson_title?: string
  title?: string
  topic?: string
  query?: string
}
interface PlanRow {
  id: string
  title?: string
  subject?: string
}

const GROUP_LABELS: Record<Hit['group'], { zh: string; en: string }> = {
  nav: { zh: '快速导航', en: 'Navigate' },
  lesson: { zh: '课程', en: 'Lessons' },
  plan: { zh: '学习计划', en: 'Study plans' },
  help: { zh: '帮助', en: 'Help' },
}

// ── Public bus so the topbar trigger can open the palette ────────────────────
const OPEN_EVENT = 'mm-command-palette-open'
export function openCommandPalette() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OPEN_EVENT))
  }
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [loading, setLoading] = useState(false)

  const { language } = useLanguage()
  const lang: 'zh' | 'en' = language === 'zh' ? 'zh' : 'en'
  const router = useRouter()
  const { getToken, isSignedIn } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const trapRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: () => setOpen(false) })

  // Open on Cmd+K / Ctrl+K, close on Esc.
  useKeyboardShortcut(
    { key: 'k', meta: true, ignoreInputs: false },
    () => setOpen((v) => !v)
  )

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, handler)
    return () => window.removeEventListener(OPEN_EVENT, handler)
  }, [])

  // Fetch lessons + plans the first time the palette opens.
  const fetchedRef = useRef(false)
  useEffect(() => {
    if (!open || fetchedRef.current || !isSignedIn) return
    fetchedRef.current = true
    setLoading(true)
    ;(async () => {
      try {
        const token = await getToken()
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
        const [lRes, pRes] = await Promise.all([
          fetch('/api/backend/users/me/lessons?limit=50', { headers }),
          fetch('/api/backend/study-plan/my-plans', { headers }),
        ])
        if (lRes.ok) {
          const lData = await lRes.json().catch(() => null)
          const arr: LessonRow[] = Array.isArray(lData) ? lData : (lData?.lessons || lData?.items || [])
          setLessons(arr)
        }
        if (pRes.ok) {
          const pData = await pRes.json().catch(() => null)
          const arr: PlanRow[] = Array.isArray(pData) ? pData : (pData?.plans || pData?.items || [])
          setPlans(arr)
        }
      } catch (err) {
        console.warn('[CommandPalette] fetch failed', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [open, isSignedIn, getToken])

  // Reset transient UI state on close.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIdx(0)
    } else {
      // Focus the search box on open
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const hits: Hit[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const navHits: Hit[] = NAV.map((n) => ({
      id: `nav:${n.href}`,
      title: lang === 'zh' ? n.zh : n.en,
      subtitle: lang === 'zh' ? n.hint_zh : n.hint_en,
      group: 'nav',
      href: n.href,
      icon: n.icon,
      keywords: `${n.zh} ${n.en} ${n.hint_zh ?? ''} ${n.hint_en ?? ''}`.toLowerCase(),
    }))
    const lessonHits: Hit[] = lessons.map((l) => ({
      id: `lesson:${l.id}`,
      title: l.lesson_title || l.title || l.topic || (lang === 'zh' ? '未命名课程' : 'Untitled lesson'),
      subtitle: l.query || l.topic || (lang === 'zh' ? '课程' : 'Lesson'),
      group: 'lesson',
      href: `/lessons/${l.id}`,
      icon: <BookOpen size={16} />,
      keywords: `${l.lesson_title ?? ''} ${l.title ?? ''} ${l.topic ?? ''} ${l.query ?? ''}`.toLowerCase(),
    }))
    const planHits: Hit[] = plans.map((p) => ({
      id: `plan:${p.id}`,
      title: p.title || (lang === 'zh' ? '未命名计划' : 'Untitled plan'),
      subtitle: p.subject || (lang === 'zh' ? '学习计划' : 'Study plan'),
      group: 'plan',
      href: `/study-plan/${p.id}`,
      icon: <Compass size={16} />,
      keywords: `${p.title ?? ''} ${p.subject ?? ''}`.toLowerCase(),
    }))
    const helpHits: Hit[] = [
      {
        id: 'help:shortcuts',
        title: lang === 'zh' ? '查看键盘快捷键' : 'View keyboard shortcuts',
        subtitle: lang === 'zh' ? '按 ? 直接打开' : 'Press ? to open directly',
        group: 'help',
        href: '#shortcuts',
        icon: <Sparkles size={16} />,
        keywords: 'shortcut keyboard hotkey help 快捷键',
      },
    ]

    const all = [...navHits, ...lessonHits, ...planHits, ...helpHits]
    if (!q) return all
    return all.filter((h) =>
      h.title.toLowerCase().includes(q) ||
      (h.subtitle ?? '').toLowerCase().includes(q) ||
      (h.keywords ?? '').includes(q)
    )
  }, [query, lessons, plans, lang])

  // Group results, keeping deterministic order.
  const grouped = useMemo(() => {
    const order: Hit['group'][] = ['nav', 'lesson', 'plan', 'help']
    return order
      .map((g) => ({ group: g, items: hits.filter((h) => h.group === g) }))
      .filter((g) => g.items.length > 0)
  }, [hits])

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped])

  // Clamp activeIdx into range when hits change.
  useEffect(() => {
    if (activeIdx >= flat.length) setActiveIdx(Math.max(0, flat.length - 1))
  }, [flat.length, activeIdx])

  const select = useCallback((hit: Hit) => {
    setOpen(false)
    if (hit.id === 'help:shortcuts') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true }))
      return
    }
    router.push(hit.href)
  }, [router])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(flat.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = flat[activeIdx]
      if (hit) select(hit)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-24 px-4 bg-slate-950/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={lang === 'zh' ? '命令面板' : 'Command palette'}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden focus:outline-none"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
            onKeyDown={onKeyDown}
            placeholder={lang === 'zh'
              ? '搜索课程、计划或快捷操作…'
              : 'Search lessons, plans, or jump to anywhere…'}
            className="flex-1 bg-transparent border-0 outline-none text-sm text-slate-900 placeholder:text-slate-400"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-300 bg-slate-50 text-slate-500">
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {flat.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              {loading
                ? (lang === 'zh' ? '加载中…' : 'Loading…')
                : (lang === 'zh' ? '没有匹配的结果' : 'No results')}
            </div>
          ) : (
            grouped.map((g) => (
              <div key={g.group}>
                <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  {GROUP_LABELS[g.group][lang]}
                </div>
                {g.items.map((hit) => {
                  const idx = flat.indexOf(hit)
                  const active = idx === activeIdx
                  return (
                    <button
                      key={hit.id}
                      type="button"
                      onClick={() => select(hit)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`w-full text-left px-4 py-2 flex items-center gap-3 ${
                        active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`${active ? 'text-indigo-600' : 'text-slate-500'} shrink-0`}>
                        {hit.icon || <Search size={14} />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{hit.title}</div>
                        {hit.subtitle && (
                          <div className="text-xs text-slate-500 truncate">{hit.subtitle}</div>
                        )}
                      </span>
                      {active && (
                        <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-indigo-300 bg-white text-indigo-600 shrink-0">
                          ↵
                        </kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <kbd className="font-mono px-1 py-0.5 rounded border border-slate-300 bg-white">↑</kbd>
            <kbd className="font-mono px-1 py-0.5 rounded border border-slate-300 bg-white">↓</kbd>
            {lang === 'zh' ? '选择' : 'navigate'}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="font-mono px-1 py-0.5 rounded border border-slate-300 bg-white">↵</kbd>
            {lang === 'zh' ? '打开' : 'open'}
          </span>
          <span className="ml-auto">
            {flat.length} {lang === 'zh' ? '项' : 'results'}
          </span>
        </div>
      </div>
    </div>
  )
}
