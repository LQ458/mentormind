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

const TELEMETRY_ENDPOINT = '/api/backend/telemetry/event'
const SESSION_KEY = 'mm_telemetry_session_id'

let queue: TelemetryPayload[] = []
let initialized = false

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

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)
    if (existing) return existing
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
      url: meta?.url ?? window.location.href,
      viewport_w: window.innerWidth,
      viewport_h: window.innerHeight,
    }
    if (typeof meta?.latency_ms === 'number') event.latency_ms = meta.latency_ms
    if (payload && Object.keys(payload).length > 0) event.payload = payload
    send(event)
  } catch {
    // swallow
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
        }
      } catch {
        // swallow
      }
    })
  } catch {
    // swallow
  }
}
