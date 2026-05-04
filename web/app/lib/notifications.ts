'use client'

import { useEffect, useState, useCallback } from 'react'

export type NotificationKind = 'whats_new' | 'system' | 'lesson' | 'reminder' | 'tip'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: number
  read: boolean
  href?: string
  icon?: string
}

const STORAGE_KEY = 'mm-notifications-v1'
const SEED_FLAG_KEY = 'mm-notifications-seeded-v3'
const EVENT = 'mm-notifications-changed'

// ── Storage ─────────────────────────────────────────────────────────────────

function load(): AppNotification[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(items: AppNotification[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch {}
}

// ── Seeding: surface what's new on first run ────────────────────────────────

const WHATS_NEW_SEEDS: Array<Omit<AppNotification, 'id' | 'createdAt' | 'read'>> = [
  {
    kind: 'whats_new',
    icon: '⌨️',
    title: 'Keyboard shortcuts',
    body: 'Press ? anywhere to see the new shortcut panel. Cmd+/ also opens it. Space pauses lessons. F toggles fullscreen on the board.',
  },
  {
    kind: 'whats_new',
    icon: '🖼️',
    title: 'Fullscreen lessons',
    body: 'Click the new Fullscreen button on the board, or press F. Esc exits.',
  },
  {
    kind: 'whats_new',
    icon: '⚙️',
    title: 'Display settings on the board',
    body: 'Open the Display popover (gear icon next to pause) to change font size and toggle high contrast. Saved per device.',
  },
  {
    kind: 'whats_new',
    icon: '💾',
    title: 'Auto-saved lesson drafts',
    body: 'Your /create chat is saved every 1.5 s. Refresh the tab and we will offer to restore it.',
  },
  {
    kind: 'whats_new',
    icon: '📥',
    title: 'Drag-and-drop uploads',
    body: 'Drag an audio or image file anywhere on the Create page. Type is detected automatically.',
  },
  {
    kind: 'whats_new',
    icon: '🔔',
    title: 'Toast notifications',
    body: 'Save / error messages now appear as non-blocking toasts in the top-right instead of browser alerts.',
  },
  {
    kind: 'whats_new',
    icon: '📋',
    title: 'Copy code blocks',
    body: 'Hover any code block on the board to see a Copy button. The button confirms when copied.',
  },
  {
    kind: 'whats_new',
    icon: '✨',
    title: 'Skeleton loaders',
    body: 'Dashboard and library show shimmering placeholder cards while loading instead of just plain text.',
  },
  {
    kind: 'whats_new',
    icon: '♿',
    title: 'Reduced-motion respected',
    body: 'If your OS prefers reduced motion, lesson element animations and panel transitions are simplified to fades.',
  },
  {
    kind: 'whats_new',
    icon: '📡',
    title: 'Smarter board reconnect',
    body: 'If the WebSocket drops, the board now retries up to 5 times with backoff and shows "Reconnecting 2/5…" inline.',
  },
  {
    kind: 'whats_new',
    icon: '🛡️',
    title: 'Crash-resistant pages',
    body: 'A crash inside any page now shows a recovery card with Retry and Home buttons instead of a white screen.',
  },
  {
    kind: 'whats_new',
    icon: '🎯',
    title: 'Modal focus traps',
    body: 'Comprehension checkpoints and the summary panel now keep keyboard focus inside the dialog and return it to the trigger on close.',
  },
  {
    kind: 'whats_new',
    icon: '📐',
    title: 'Cleaner code-in-prose',
    body: 'Definition / Theorem / Highlight cards now break inline code (like int x;) onto its own line with monospace font instead of mashing it into the explanation.',
  },
  {
    kind: 'whats_new',
    icon: '🔍',
    title: 'Cmd+K command palette',
    body: 'The topbar search now opens a fast palette: press Cmd+K (or Ctrl+K) anywhere to jump to a lesson, plan, or page. Arrow keys navigate, Enter opens.',
  },
  {
    kind: 'whats_new',
    icon: '🛟',
    title: 'Resume in-progress generation',
    body: 'If you start generating a study-plan unit and leave, we now save your spot. Reopen the plan and we jump you back to that unit and notify you when it finishes.',
  },
  {
    kind: 'whats_new',
    icon: '🖥️',
    title: 'Fullscreen board lessons',
    body: 'A new Fullscreen button (or press F) on the board page expands the lesson canvas to fill your screen. Esc to exit.',
  },
  {
    kind: 'whats_new',
    icon: '🗺️',
    title: 'Personal knowledge graph',
    body: 'Open Knowledge map in the sidebar. After every lesson, AI extracts concepts and relationships and builds your own learning graph. Click any node to see related lessons.',
    href: '/knowledge-graph',
  },
]

function seedIfFirstRun() {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(SEED_FLAG_KEY)) return
  const now = Date.now()
  const seeded: AppNotification[] = WHATS_NEW_SEEDS.map((s, i) => ({
    ...s,
    id: `whats-new-${i + 1}`,
    createdAt: now - i * 1000, // ordered, all fresh
    read: false,
  }))
  save(seeded)
  window.localStorage.setItem(SEED_FLAG_KEY, '1')
}

// ── Public API ──────────────────────────────────────────────────────────────

export function pushNotification(input: Omit<AppNotification, 'id' | 'createdAt' | 'read'> & { id?: string }) {
  const items = load()
  const id = input.id || `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  // Dedupe by id
  if (items.some((n) => n.id === id)) return
  const next: AppNotification = {
    id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    href: input.href,
    icon: input.icon,
    createdAt: Date.now(),
    read: false,
  }
  save([next, ...items].slice(0, 100))
}

export function markRead(id: string) {
  save(load().map((n) => (n.id === id ? { ...n, read: true } : n)))
}

export function markAllRead() {
  save(load().map((n) => ({ ...n, read: true })))
}

export function dismiss(id: string) {
  save(load().filter((n) => n.id !== id))
}

export function clearAll() {
  save([])
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([])

  useEffect(() => {
    seedIfFirstRun()
    setItems(load())
    const refresh = () => setItems(load())
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) refresh()
    })
    return () => {
      window.removeEventListener(EVENT, refresh)
    }
  }, [])

  const unreadCount = items.filter((n) => !n.read).length

  return {
    items,
    unreadCount,
    markRead: useCallback((id: string) => markRead(id), []),
    markAllRead: useCallback(() => markAllRead(), []),
    dismiss: useCallback((id: string) => dismiss(id), []),
    clearAll: useCallback(() => clearAll(), []),
  }
}
