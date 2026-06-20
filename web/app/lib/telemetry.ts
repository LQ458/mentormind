/**
 * Frontend telemetry library — fire-and-forget event tracking.
 *
 * - Backend endpoint: POST /telemetry/event (proxied via /api/backend/telemetry/event).
 * - Uses navigator.sendBeacon when available; falls back to fetch with keepalive.
 * - All errors are swallowed; this must never crash the host app.
 * - PII: do not pass user input strings as payload values automatically.
 */

export type EventType =
  | 'page_view'
  | 'page_unload'
  | 'generation_latency'
  | 'element_paint'
  | 'ws_close'
  | 'long_task'
  | 'error_console'
  | 'error_network'
  | 'interaction'
  | 'board_lesson_open'
  | 'study_plan_chat_rtt'
  | 'survey_response'
  | 'feedback_click'
  | 'feedback_moment'

interface TrackMeta {
  latency_ms?: number
  page?: string
  url?: string
}

interface TelemetryPayload {
  session_id: string
  event_type: EventType
  page?: string
  url?: string
  latency_ms?: number
  payload?: Record<string, unknown>
  viewport_w?: number
  viewport_h?: number
}

interface TelemetryBreadcrumb {
  at: string
  event_type: EventType
  page?: string
  latency_ms?: number
  payload?: Record<string, unknown>
}

const TELEMETRY_ENDPOINT = '/api/backend/telemetry/event'
const SESSION_KEY = 'mm_telemetry_session_id'
const RECENT_EVENTS_KEY = 'mm_telemetry_recent_events_v1'
const PENDING_FEEDBACK_KEY = 'mm_pending_feedback_events_v1'
const RECENT_LIMIT = 24
const FEEDBACK_CONTEXT_LIMIT = 10
const PENDING_FEEDBACK_LIMIT = 8
const PENDING_FEEDBACK_MAX_BYTES = 48 * 1024
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,254}$/
const FRONTEND_BUILD = {
  sha: process.env.NEXT_PUBLIC_BUILD_SHA || '',
  image_tag: process.env.NEXT_PUBLIC_IMAGE_TAG || '',
}

const SAFE_BREADCRUMB_KEYS = new Set([
  'action',
  'answer_mode',
  'area',
  'code',
  'duration_ms',
  'error',
  'kind',
  'message',
  'method',
  'phase',
  'schema',
  'severity',
  'source',
  'status',
  'status_code',
  'surface',
  'url',
])

let queue: TelemetryPayload[] = []
let initialized = false
let fetchInstrumented = false
let feedbackFlushInFlight = false
let feedbackFlushTimer: number | null = null

function safeUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  // Fallback: simple random string
  return `tlm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeSessionId(value: string | null): string | null {
  const trimmed = (value || '').trim()
  return SAFE_SESSION_ID_RE.test(trimmed) ? trimmed : null
}

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    const existing = normalizeSessionId(window.sessionStorage.getItem(SESSION_KEY))
    if (existing) {
      window.sessionStorage.setItem(SESSION_KEY, existing)
      return existing
    }
    const fresh = safeUUID()
    window.sessionStorage.setItem(SESSION_KEY, fresh)
    return fresh
  } catch {
    return safeUUID()
  }
}

function send(payload: TelemetryPayload): void {
  try {
    const body = JSON.stringify(payload)
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      const blob = new Blob([body], { type: 'application/json' })
      const ok = navigator.sendBeacon(TELEMETRY_ENDPOINT, blob)
      if (ok) return
    }
    // Fallback: fetch with keepalive so unload doesn't cancel us.
    if (typeof fetch === 'function') {
      void fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // swallow
  }
}

async function sendInteractive(payload: TelemetryPayload): Promise<boolean> {
  try {
    const res = await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
    if (!res.ok) return false
    const data = await res.json().catch(() => ({}))
    return data?.ok !== false && data?.recorded !== false
  } catch {
    return false
  }
}

function pendingFeedbackKey(event: TelemetryPayload): string {
  const payload = event.payload || {}
  const reportId = typeof payload.report_id === 'string' ? payload.report_id : ''
  return reportId || `${event.session_id}:${event.event_type}:${event.page}:${event.url}`
}

function readPendingFeedbackEvents(): TelemetryPayload[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(PENDING_FEEDBACK_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.event_type === 'feedback_moment').slice(-PENDING_FEEDBACK_LIMIT)
      : []
  } catch {
    return []
  }
}

function writePendingFeedbackEvents(events: TelemetryPayload[]): void {
  if (typeof window === 'undefined') return
  try {
    const bounded = events.slice(-PENDING_FEEDBACK_LIMIT)
    let text = JSON.stringify(bounded)
    let trimmed = bounded
    while (text.length > PENDING_FEEDBACK_MAX_BYTES && trimmed.length > 0) {
      trimmed = trimmed.slice(1)
      text = JSON.stringify(trimmed)
    }
    if (trimmed.length === 0) {
      window.sessionStorage.removeItem(PENDING_FEEDBACK_KEY)
    } else {
      window.sessionStorage.setItem(PENDING_FEEDBACK_KEY, text)
    }
  } catch {
    // Losing the fallback buffer must not affect the app.
  }
}

function queuePendingFeedbackEvent(event: TelemetryPayload): void {
  if (event.event_type !== 'feedback_moment') return
  try {
    const existing = readPendingFeedbackEvents()
    const key = pendingFeedbackKey(event)
    const next = [
      ...existing.filter((item) => pendingFeedbackKey(item) !== key),
      event,
    ]
    writePendingFeedbackEvents(next)
    schedulePendingFeedbackFlush(15000)
  } catch {
    // swallow
  }
}

async function flushPendingFeedbackEvents(): Promise<void> {
  if (feedbackFlushInFlight) return
  const pending = readPendingFeedbackEvents()
  if (pending.length === 0) return
  feedbackFlushInFlight = true
  try {
    const remaining: TelemetryPayload[] = []
    for (const event of pending) {
      const ok = await sendInteractive(event)
      if (!ok) remaining.push(event)
    }
    writePendingFeedbackEvents(remaining)
    if (remaining.length > 0) schedulePendingFeedbackFlush(60000)
  } finally {
    feedbackFlushInFlight = false
  }
}

function schedulePendingFeedbackFlush(delayMs = 5000): void {
  if (typeof window === 'undefined') return
  try {
    if (feedbackFlushTimer !== null) {
      window.clearTimeout(feedbackFlushTimer)
    }
    feedbackFlushTimer = window.setTimeout(() => {
      feedbackFlushTimer = null
      void flushPendingFeedbackEvents().catch(() => {})
    }, delayMs)
  } catch {
    // swallow
  }
}

function safeString(value: unknown, max = 180): string {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, max)
}

function safeUrlPath(value: unknown): string | undefined {
  const raw = safeString(value, 512)
  if (!raw) return undefined
  try {
    const url = new URL(raw, window.location.origin)
    return `${url.pathname}${url.search ? '?...' : ''}`
  } catch {
    return raw.split('?')[0].split('#')[0].slice(0, 240)
  }
}

function browserFamily(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent || ''
  if (/Edg\//.test(ua)) return 'Edge'
  if (/Chrome\//.test(ua) || /CriOS\//.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua) || /FxiOS\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'Other'
}

function compactPayload(payload?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!payload) return undefined
  const compact: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (!SAFE_BREADCRUMB_KEYS.has(key)) continue
    if (key === 'url') {
      const path = safeUrlPath(value)
      if (path) compact[key] = path
      continue
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      compact[key] = value
      continue
    }
    if (value !== null && value !== undefined) {
      compact[key] = safeString(value)
    }
  }
  return Object.keys(compact).length ? compact : undefined
}

function readRecentEvents(): TelemetryBreadcrumb[] {
  try {
    const raw = window.sessionStorage.getItem(RECENT_EVENTS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.slice(-RECENT_LIMIT) : []
  } catch {
    return []
  }
}

function rememberEvent(event: TelemetryPayload): void {
  try {
    if (event.event_type === 'feedback_moment' || event.event_type === 'survey_response') return
    const next: TelemetryBreadcrumb = {
      at: new Date().toISOString(),
      event_type: event.event_type,
      page: event.page,
    }
    if (typeof event.latency_ms === 'number') next.latency_ms = event.latency_ms
    const payload = compactPayload(event.payload)
    if (payload) next.payload = payload
    const events = [...readRecentEvents(), next].slice(-RECENT_LIMIT)
    window.sessionStorage.setItem(RECENT_EVENTS_KEY, JSON.stringify(events))
  } catch {
    // Telemetry memory should never affect the app.
  }
}

export function getTelemetryContextSnapshot(appSnapshot?: Record<string, unknown>): Record<string, unknown> {
  if (typeof window === 'undefined') return { app_snapshot: appSnapshot || {} }
  const recentEvents = readRecentEvents().slice(-FEEDBACK_CONTEXT_LIMIT)
  const recentErrors = recentEvents
    .filter((event) => ['error_console', 'error_network', 'ws_close'].includes(event.event_type))
    .slice(-5)

  return {
    captured_at: new Date().toISOString(),
    session_id: getOrCreateSessionId(),
    build: FRONTEND_BUILD,
    route: window.location.pathname,
    url: safeUrlPath(window.location.href),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    browser: {
      language: navigator.language,
      family: browserFamily(),
      mobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || ''),
    },
    recent_events: recentEvents,
    recent_errors: recentErrors,
    app_snapshot: appSnapshot || {},
  }
}

export function track(
  type: EventType,
  payload?: Record<string, unknown>,
  meta?: TrackMeta,
): void {
  try {
    if (typeof window === 'undefined') return
    const session_id = getOrCreateSessionId()
    const event: TelemetryPayload = {
      session_id,
      event_type: type,
      page: meta?.page ?? window.location.pathname,
      url: safeUrlPath(meta?.url ?? window.location.href),
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
    }
    if (typeof meta?.latency_ms === 'number') event.latency_ms = meta.latency_ms
    if (payload && Object.keys(payload).length > 0) event.payload = payload
    rememberEvent(event)
    send(event)
  } catch {
    // swallow
  }
}

export async function trackNow(
  type: EventType,
  payload?: Record<string, unknown>,
  meta?: TrackMeta,
): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false
    const session_id = getOrCreateSessionId()
    const event: TelemetryPayload = {
      session_id,
      event_type: type,
      page: meta?.page ?? window.location.pathname,
      url: safeUrlPath(meta?.url ?? window.location.href),
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
    }
    if (typeof meta?.latency_ms === 'number') event.latency_ms = meta.latency_ms
    if (payload && Object.keys(payload).length > 0) event.payload = payload
    rememberEvent(event)
    const ok = await sendInteractive(event)
    if (!ok) {
      queuePendingFeedbackEvent(event)
      return false
    }
    if (type === 'feedback_moment') {
      void flushPendingFeedbackEvents().catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

export function flush(): void {
  try {
    if (queue.length === 0) return
    const pending = queue
    queue = []
    for (const ev of pending) send(ev)
  } catch {
    // swallow
  }
}

export function initTelemetry(): void {
  if (initialized) return
  if (typeof window === 'undefined') return
  initialized = true

  try {
    if (!fetchInstrumented && typeof window.fetch === 'function') {
      fetchInstrumented = true
      const originalFetch = window.fetch.bind(window)
      window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const method = (init?.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase()
        const rawUrl = typeof input === 'string' || input instanceof URL
          ? String(input)
          : input instanceof Request
            ? input.url
            : ''
        const urlPath = safeUrlPath(rawUrl)
        const isTelemetryRequest = !!urlPath && urlPath.includes('/api/backend/telemetry/event')
        try {
          const response = await originalFetch(input, init)
          if (!isTelemetryRequest && response.status >= 400) {
            const elapsed = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
            track('error_network', {
              source: 'fetch',
              method,
              url: urlPath,
              status_code: response.status,
              status: response.statusText,
              duration_ms: elapsed,
            }, { latency_ms: elapsed })
          }
          return response
        } catch (err) {
          if (!isTelemetryRequest) {
            const elapsed = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt)
            track('error_network', {
              source: 'fetch',
              method,
              url: urlPath,
              error: err instanceof Error ? err.message.slice(0, 180) : 'fetch failed',
              duration_ms: elapsed,
            }, { latency_ms: elapsed })
          }
          throw err
        }
      }) as typeof window.fetch
    }

    void flushPendingFeedbackEvents().catch(() => {})

    window.addEventListener('online', () => schedulePendingFeedbackFlush(1000))
    window.addEventListener('focus', () => schedulePendingFeedbackFlush(2000))

    // Global error capture — record only what's safe (no user input).
    window.addEventListener('error', (ev) => {
      try {
        track('error_console', {
          message: typeof ev.message === 'string' ? ev.message.slice(0, 256) : 'error',
          source: typeof ev.filename === 'string' ? ev.filename : undefined,
          lineno: ev.lineno,
          colno: ev.colno,
        })
      } catch {
        // swallow
      }
    })

    window.addEventListener('unhandledrejection', (ev) => {
      try {
        const reason = (ev as PromiseRejectionEvent).reason
        const message =
          reason instanceof Error
            ? reason.message
            : typeof reason === 'string'
              ? reason
              : 'unhandledrejection'
        track('error_console', { message: String(message).slice(0, 256), kind: 'promise' })
      } catch {
        // swallow
      }
    })

    // Long task observer (jank detection).
    try {
      const PO: typeof PerformanceObserver | undefined = (window as unknown as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver
      if (PO) {
        const obs = new PO((list) => {
          for (const entry of list.getEntries()) {
            track('long_task', { name: entry.name, duration: Math.round(entry.duration) })
          }
        })
        try {
          obs.observe({ entryTypes: ['longtask'] })
        } catch {
          // longtask not supported
        }
      }
    } catch {
      // swallow
    }

    // Flush on unload.
    window.addEventListener('beforeunload', () => {
      try {
        track('page_unload')
        flush()
      } catch {
        // swallow
      }
    })

    // Page visibility -> page_unload analog when tab hides.
    document.addEventListener('visibilitychange', () => {
      try {
        if (document.visibilityState === 'hidden') {
          flush()
        } else if (document.visibilityState === 'visible') {
          schedulePendingFeedbackFlush(2000)
        }
      } catch {
        // swallow
      }
    })

    window.setInterval(() => {
      schedulePendingFeedbackFlush(1000)
    }, 60000)
  } catch {
    // swallow
  }
}
