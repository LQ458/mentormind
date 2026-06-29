'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { track } from '../lib/telemetry'
import type {
  BoardWSState,
  BoardStatus,
  BoardState,
  BoardElement,
  BoardEvent,
  AudioReady,
  AgentEvent,
  NarrationLog,
  ChatMessage,
  UserMessageEvent,
  UseBoardWebSocketOptions,
  BoardClientAction,
} from './useBoardWebSocket.types'

// Re-export the full type surface so every existing consumer importing from
// '.../useBoardWebSocket' keeps resolving unchanged.
export * from './useBoardWebSocket.types'

// ── Values ───────────────────────────────────────────────────────────────────

export const RECONNECT_MAX_ATTEMPTS = 5

export const INITIAL_BOARD_STATE: BoardWSState = {
  board: null,
  elements: {},
  elementOrder: [],
  narrationLog: [],
  currentNarration: null,
  agentActivity: [],
  summary: null,
  audioByElementId: {},
  audioQueue: [],
  chatHistory: [],
  status: 'idle',
  error: null,
  reconnectAttempt: 0,
  writingStatus: 'idle',
  writingElementId: null,
  pendingInvite: null,
}

const initialState: BoardWSState = {
  board: null,
  elements: {},
  elementOrder: [],
  narrationLog: [],
  currentNarration: null,
  agentActivity: [],
  summary: null,
  audioByElementId: {},
  audioQueue: [],
  chatHistory: [],
  status: 'idle',
  error: null,
  reconnectAttempt: 0,
  writingStatus: 'idle',
  writingElementId: null,
  pendingInvite: null,
}

type Action =
  | { type: 'SET_STATUS'; status: BoardStatus; error?: string | null; reconnectAttempt?: number }
  | { type: 'EVENT'; event: BoardEvent }
  | { type: 'RESET' }
  | { type: 'RESTORE_STATE'; snapshot: Partial<BoardWSState> }

function reducer(state: BoardWSState, action: Action): BoardWSState {
  switch (action.type) {
    case 'SET_STATUS':
      return {
        ...state,
        status: action.status,
        error: action.error ?? null,
        reconnectAttempt: action.reconnectAttempt ?? (action.status === 'open' || action.status === 'streaming' ? 0 : state.reconnectAttempt),
      }
    case 'RESET':
      return initialState
    case 'EVENT':
      return applyEvent(state, action.event)
    case 'RESTORE_STATE': {
      // Hydrate a saved snapshot. We preserve any in-flight WS bookkeeping
      // (status / reconnectAttempt / error) if the live state is already
      // mid-stream — this prevents a late RESTORE_STATE call from clobbering
      // an active connection. Element/narration/audio/chat collections from
      // the snapshot are merged in but never overwrite live data.
      const snap = action.snapshot
      const hasLiveStream = state.status === 'streaming' || state.status === 'open'
      const mergedElements = { ...(snap.elements || {}), ...state.elements }
      const seenIds = new Set(state.elementOrder)
      const mergedOrder = [
        ...((snap.elementOrder || []).filter((id) => !seenIds.has(id))),
        ...state.elementOrder,
      ]
      return {
        ...state,
        board: state.board ?? snap.board ?? state.board,
        elements: hasLiveStream ? mergedElements : (snap.elements ?? state.elements),
        elementOrder: hasLiveStream ? mergedOrder : (snap.elementOrder ?? state.elementOrder),
        narrationLog: hasLiveStream
          ? state.narrationLog
          : (snap.narrationLog ?? state.narrationLog),
        audioQueue: hasLiveStream
          ? state.audioQueue
          : (snap.audioQueue ?? state.audioQueue),
        audioByElementId: hasLiveStream
          ? state.audioByElementId
          : (snap.audioByElementId ?? state.audioByElementId),
        chatHistory: hasLiveStream
          ? state.chatHistory
          : (snap.chatHistory ?? state.chatHistory),
        status: hasLiveStream ? state.status : (snap.status ?? state.status),
        writingStatus: hasLiveStream
          ? state.writingStatus
          : (snap.writingStatus ?? state.writingStatus),
      }
    }
    default:
      return state
  }
}

function coerceAgentText(v: unknown): string {
  if (typeof v === 'string') return v
  if (v == null) return ''
  try { return JSON.stringify(v) } catch { return String(v) }
}

function timestampToMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return Date.now()
  return value < 10_000_000_000 ? value * 1000 : value
}

export function applyBoardEvent(state: BoardWSState, ev: BoardEvent): BoardWSState {
  return applyEvent(state, ev)
}

function applyEvent(state: BoardWSState, ev: BoardEvent): BoardWSState {
  switch (ev.event_type) {
    case 'board_created':
      return {
        ...state,
        status: 'streaming',
        board: {
          board_id: ev.data.board_id,
          title: ev.data.title,
          layout: ev.data.layout,
          background: ev.data.background,
          topic: ev.data.topic,
        },
      }
    case 'element_added': {
      // Backend emits element_id at the top level of BoardEvent; data.element_id
      // is usually absent. Fall back to data.element_id for older payloads.
      const id = (ev as any).element_id ?? ev.data.element_id
      if (!id) return state
      const elem: BoardElement = {
        element_id: id,
        element_type: ev.data.element_type,
        content: ev.data.content,
        position: ev.data.position,
        style: ev.data.style || {},
        narration: ev.data.narration,
        metadata: ev.data.metadata,
        state: 'normal',
      }
      const narrationLog = ev.data.narration
        ? [
            ...state.narrationLog,
            {
              element_id: id,
              text: ev.data.narration,
              timestamp: ev.timestamp,
            },
          ]
        : state.narrationLog
      // Mirror assistant narration into the chat log so the side panel shows
      // a unified transcript of both sides of the conversation.
      const chatHistory = ev.data.narration
        ? [
            ...state.chatHistory,
            {
              role: 'assistant' as const,
              text: ev.data.narration,
              timestamp: ev.timestamp,
            },
          ]
        : state.chatHistory
      // When a new element arrives with narration attached we know the
      // backend is about to synthesize TTS for it. Flip the status to
      // "writing" so the UI can surface the 正在板书... indicator; it's
      // cleared again when audio_ready lands.
      const hasNarration = Boolean(ev.data.narration)
      return {
        ...state,
        elements: { ...state.elements, [id]: elem },
        elementOrder: state.elementOrder.includes(id)
          ? state.elementOrder
          : [...state.elementOrder, id],
        narrationLog,
        currentNarration: ev.data.narration ?? state.currentNarration,
        chatHistory,
        writingStatus: hasNarration ? 'writing' : state.writingStatus,
        writingElementId: hasNarration ? id : state.writingElementId,
      }
    }
    case 'element_updated': {
      const element_id = ((ev as any).element_id ?? ev.data.element_id) as string
      const { action, new_content, narration } = ev.data
      if (!element_id) return state
      const existing = state.elements[element_id]
      if (!existing) return state
      let next: BoardElement = { ...existing }
      if (action === 'highlight') next.state = 'highlighted'
      else if (action === 'dim') next.state = 'dim'
      else if (action === 'update_content' && typeof new_content === 'string') {
        next.content = new_content
      } else if (action === 'remove') {
        const { [element_id]: _removed, ...rest } = state.elements
        return {
          ...state,
          elements: rest,
          elementOrder: state.elementOrder.filter(id => id !== element_id),
        }
      }
      const narrationLog = narration
        ? [
            ...state.narrationLog,
            { element_id, text: narration, timestamp: ev.timestamp },
          ]
        : state.narrationLog
      return {
        ...state,
        elements: { ...state.elements, [element_id]: next },
        narrationLog,
        currentNarration: narration ?? state.currentNarration,
      }
    }
    case 'board_cleared': {
      // 豆包爱学-style continuous transcript: never wipe the whole board. We
      // honor targeted removes (removed_ids) but IGNORE scope=all clears so
      // earlier items stay scrollable even if the orchestrator misbehaves.
      const removed = ev.data.removed_ids
      if (Array.isArray(removed) && removed.length > 0) {
        const nextElems: Record<string, BoardElement> = { ...state.elements }
        for (const id of removed) delete nextElems[id]
        return {
          ...state,
          elements: nextElems,
          elementOrder: state.elementOrder.filter(id => !removed.includes(id)),
        }
      }
      return state
    }
    case 'layout_changed':
      return state.board
        ? { ...state, board: { ...state.board, layout: ev.data.layout } }
        : state
    case 'narration':
      return {
        ...state,
        narrationLog: [
          ...state.narrationLog,
          {
            element_id: ev.element_id ?? null,
            text: ev.data.narration_text,
            timestamp: ev.timestamp,
            pause_after_ms: ev.data.pause_after_ms,
          },
        ],
        currentNarration: ev.data.narration_text,
      }
    case 'audio_ready': {
      const audio: AudioReady = {
        element_id: ev.element_id ?? null,
        audio_path: ev.data.audio_path,
        duration_ms: ev.data.duration_ms,
        narration_text: ev.data.narration_text,
        timestamp: ev.timestamp,
      }
      const key = audio.element_id || `__narration_${state.audioQueue.length}`
      // Audio arrived for the element we were flagging as "writing";
      // transition into narrating so the UI can swap indicators.
      const isForPending =
        state.writingElementId !== null && audio.element_id === state.writingElementId
      return {
        ...state,
        audioByElementId: { ...state.audioByElementId, [key]: audio },
        audioQueue: [...state.audioQueue, audio],
        writingStatus: isForPending ? 'narrating' : state.writingStatus,
      }
    }
    case 'audio_error':
      // Non-fatal; just drop the writing flag so the UI doesn't hang.
      return {
        ...state,
        writingStatus:
          state.writingElementId && ev.element_id === state.writingElementId
            ? 'idle'
            : state.writingStatus,
        writingElementId:
          state.writingElementId && ev.element_id === state.writingElementId
            ? null
            : state.writingElementId,
      }
    case 'narration_pending':
      return {
        ...state,
        writingStatus: 'writing',
        writingElementId: ev.element_id ?? state.writingElementId,
      }
    case 'segment_boundary':
      // Phase 1b — non-blocking inline invite. The boundary only carries
      // pacing bookkeeping for useBoardPacing (derived from element metadata);
      // here we only surface an optional invite. No invite => no state change.
      if (ev.data.invite) {
        return { ...state, pendingInvite: { ...ev.data.invite } }
      }
      return state
    case 'comprehension_check':
      // Phase 1b — end-of-lesson recap. Stored as a non-blocking pendingCheck the
      // page renders inline; the lesson never waits on an answer.
      return { ...state, pendingCheck: ev.data }
    case 'agent_start': {
      const entry: AgentEvent = {
        kind: 'start',
        agent: ev.data.agent,
        task: coerceAgentText(ev.data.task),
        timestamp: ev.timestamp,
      }
      return {
        ...state,
        agentActivity: [...state.agentActivity, entry].slice(-20),
      }
    }
    case 'agent_result': {
      const entry: AgentEvent = {
        kind: 'result',
        agent: ev.data.agent,
        result: coerceAgentText(ev.data.result),
        timestamp: ev.timestamp,
      }
      return {
        ...state,
        agentActivity: [...state.agentActivity, entry].slice(-20),
      }
    }
    case 'agent_error': {
      const entry: AgentEvent = {
        kind: 'error',
        agent: ev.data.agent,
        error: coerceAgentText(ev.data.error),
        timestamp: ev.timestamp,
      }
      return {
        ...state,
        agentActivity: [...state.agentActivity, entry].slice(-20),
      }
    }
    case 'summary_ready':
      return { ...state, summary: ev.data.summary }
    case 'user_message':
      if (state.chatHistory.some((msg) => (
        msg.role === 'user' &&
        msg.text === ev.data.text &&
        Math.abs(timestampToMs(msg.timestamp) - timestampToMs(ev.timestamp)) < 30_000
      ))) {
        return state
      }
      return {
        ...state,
        chatHistory: [
          ...state.chatHistory,
          {
            role: 'user' as const,
            text: ev.data.text,
            timestamp: ev.timestamp,
          },
        ],
      }
    case 'error':
      return { ...state, status: 'error', error: ev.data.error }
    case 'stream_done':
    case 'done':
      return { ...state, status: 'done' }
    case 'session_state': {
      const d = ev.data || {}
      const snapElements = (d.elements || {}) as Record<string, BoardElement>
      const snapOrder = (d.element_order as string[] | undefined) || Object.keys(snapElements)
      const audioQueue = (d.audio_queue || d.audioQueue || []) as AudioReady[]
      const audioByEl: Record<string, AudioReady> = {}
      for (const a of audioQueue) {
        if (a?.element_id) audioByEl[a.element_id] = a
      }
      return {
        ...state,
        board: (d.board || state.board) as BoardState | null,
        elements: snapElements,
        elementOrder: snapOrder,
        narrationLog: (d.narration_log || d.narrationLog || []) as NarrationLog[],
        audioQueue,
        audioByElementId: audioByEl,
        chatHistory: (d.chat_history || d.chatHistory || []) as ChatMessage[],
        status: (d.status === 'generating' || d.status === 'streaming') ? 'streaming' : 'done',
      }
    }
    default:
      return state
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useBoardWebSocket(opts: UseBoardWebSocketOptions) {
  const { sessionId, token, enabled, backendWsUrl } = opts
  const [state, dispatch] = useReducer(reducer, initialState)
  const wsRef = useRef<WebSocket | null>(null)
  const pendingMessagesRef = useRef<string[]>([])
  const attemptsRef = useRef(0)
  const closedByUserRef = useRef(false)
  // Mirror of state for unload-time access — useEffect cleanup can't read
  // the latest reducer value through a closure, so we keep a ref in sync.
  const stateRef = useRef<BoardWSState>(state)
  useEffect(() => { stateRef.current = state }, [state])
  // Debounced auto-save bookkeeping.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaveSeqRef = useRef(0)
  // Telemetry timing — captured when the WS opens so we can compute
  // first-element / completion latencies later.
  const openTimeRef = useRef<number | null>(null)
  const firstElementRef = useRef(false)

  // Snapshot serialiser used by both the debounced timer and the unload
  // beacon. Keeps the payload narrow (drops UI-only collections like
  // agentActivity) so we stay well below the 256KB backend cap. Status is
  // passed as a string so callers can persist non-UI lifecycle states like
  // `paused` (used during beacon-on-unload).
  const buildSnapshot = useCallback(
    (s: BoardWSState, status?: string, lastEventSeq?: number) => ({
      state: {
        board: s.board,
        elements: s.elements,
        element_order: s.elementOrder,
        narration_log: s.narrationLog,
        audio_queue: s.audioQueue,
        chat_history: s.chatHistory,
        status: status ?? s.status,
      },
      status: status ?? s.status,
      last_event_seq: typeof lastEventSeq === 'number' ? lastEventSeq : lastSaveSeqRef.current,
    }),
    [],
  )

  const scheduleSave = useCallback(() => {
    if (typeof window === 'undefined' || !sessionId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      const s = stateRef.current
      // Skip empty / idle saves.
      if (s.status === 'idle') return
      if (Object.keys(s.elements).length === 0) return
      lastSaveSeqRef.current += 1
      const body = JSON.stringify(buildSnapshot(s))
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      try {
        void fetch(`/api/backend/board/${sessionId}/save`, {
          method: 'POST',
          headers,
          body,
          keepalive: true,
        }).catch(() => {})
      } catch {
        // swallow
      }
    }, 2500)
  }, [buildSnapshot, sessionId, token])

  // Schedule a save whenever the user-visible board content changes. The
  // dependency list intentionally targets only "non-trivial" slices so
  // high-frequency status flips alone don't trigger network noise.
  useEffect(() => {
    if (!sessionId) return
    if (state.status === 'idle') return
    if (Object.keys(state.elements).length === 0) return
    scheduleSave()
  }, [
    sessionId,
    scheduleSave,
    state.status,
    state.elements,
    state.elementOrder,
    state.audioQueue,
    state.narrationLog,
    state.chatHistory,
  ])

  // Beacon-on-unload: flush the latest snapshot to the backend so a refresh
  // or tab close doesn't lose progress. Skip when the lesson already
  // reached a terminal state (done/error).
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionId) return
    const beacon = () => {
      const s = stateRef.current
      if (s.status === 'done' || s.status === 'error') return
      if (s.status === 'idle') return
      if (Object.keys(s.elements).length === 0) return
      try {
        const body = JSON.stringify(buildSnapshot(s, 'paused'))
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const blob = new Blob([body], { type: 'application/json' })
          navigator.sendBeacon(`/api/backend/board/${sessionId}/save`, blob)
          return
        }
        // Fallback: best-effort fetch with keepalive.
        if (typeof fetch === 'function') {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (token) headers.Authorization = `Bearer ${token}`
          void fetch(`/api/backend/board/${sessionId}/save`, {
            method: 'POST',
            headers,
            body,
            keepalive: true,
          }).catch(() => {})
        }
      } catch {
        // swallow
      }
    }
    window.addEventListener('beforeunload', beacon)
    return () => {
      window.removeEventListener('beforeunload', beacon)
      // Also fire on unmount to capture in-app navigation away from the page.
      beacon()
    }
  }, [sessionId, token, buildSnapshot])

  const buildUrl = useCallback((): string | null => {
    const envUrl = backendWsUrl || process.env.NEXT_PUBLIC_BACKEND_WS_URL
    const withToken = (base: string) => {
      const cleanBase = base.replace(/\/$/, '')
      const path = `${cleanBase}/ws/board/${sessionId}`
      return token ? `${path}?token=${encodeURIComponent(token)}` : path
    }
    if (envUrl) {
      if (!token) return null
      return withToken(envUrl)
    }
    if (typeof window === 'undefined') return null
    const { hostname, protocol } = window.location
    const scheme = protocol === 'https:' ? 'wss' : 'ws'
    const isDev = hostname === 'localhost' || hostname === '127.0.0.1'
    if (isDev) {
      // Dev backend never has TLS — always use plain ws://
      if (!token) return null
      return `ws://${hostname}:8000/ws/board/${sessionId}?token=${encodeURIComponent(token)}`
    }
    // Production same-origin WS uses HttpOnly cookies through nginx /ws/ routing.
    // Keep bearer tokens out of the URL because access logs record query strings.
    return `${scheme}://${window.location.host}/ws/board/${sessionId}`
  }, [sessionId, token, backendWsUrl])

  const connect = useCallback(() => {
    const url = buildUrl()
    if (!url) return
    dispatch({ type: 'SET_STATUS', status: 'connecting' })
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (err) {
      dispatch({
        type: 'SET_STATUS',
        status: 'error',
        error: err instanceof Error ? err.message : 'WS construction failed',
      })
      return
    }
    wsRef.current = ws

    ws.onopen = () => {
      console.info('[board/ws] open', { sessionId })
      attemptsRef.current = 0
      openTimeRef.current = Date.now()
      firstElementRef.current = false
      // Reset status from `connecting` so the UI isn't stuck there while
      // we wait for the first `board_created` event. The reducer will
      // promote this to `streaming` when real events start arriving.
      dispatch({ type: 'SET_STATUS', status: 'open' })
      const queued = pendingMessagesRef.current.splice(0)
      for (const text of queued) {
        try {
          ws.send(JSON.stringify({ action: 'user_message', text }))
        } catch {
          pendingMessagesRef.current.unshift(text)
          break
        }
      }
    }

    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data as string) as BoardEvent
        if (!parsed || typeof parsed.event_type !== 'string') return
        dispatch({ type: 'EVENT', event: parsed })
        // Telemetry: first element_added after open => first paint latency.
        if (
          parsed.event_type === 'element_added' &&
          !firstElementRef.current &&
          openTimeRef.current
        ) {
          firstElementRef.current = true
          track(
            'generation_latency',
            { phase: 'first_element', session_id: sessionId },
            { latency_ms: Date.now() - openTimeRef.current },
          )
        }
        if (parsed.event_type === 'done' || parsed.event_type === 'stream_done') {
          // Lesson finished — treat the ensuing close as intentional so we don't retry with a stale token.
          closedByUserRef.current = true
          if (openTimeRef.current) {
            const elementCount = Object.keys(stateRef.current.elements).length
            track(
              'generation_latency',
              {
                phase: 'complete',
                element_count: elementCount,
                session_id: sessionId,
              },
              { latency_ms: Date.now() - openTimeRef.current },
            )
          }
        } else if (parsed.event_type === 'error') {
          // Server signalled a terminal error before closing (e.g. session not
          // found). Mark closed-by-user so the close handler doesn't retry.
          const detail = (parsed as { data?: { error?: string } })?.data?.error
          closedByUserRef.current = true
          dispatch({
            type: 'SET_STATUS',
            status: 'error',
            error: detail || 'Lesson session error',
            reconnectAttempt: attemptsRef.current,
          })
        }
      } catch (err) {
        console.warn('[useBoardWebSocket] bad message', err)
      }
    }

    ws.onerror = (event) => {
      console.warn('[board/ws] error', { sessionId, event })
      // Most browsers give no detail here; treat as transient.
    }

    ws.onclose = (event) => {
      console.warn('[board/ws] close', {
        sessionId,
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        attempt: attemptsRef.current,
      })
      wsRef.current = null
      try {
        track('ws_close', {
          code: event.code,
          reason: typeof event.reason === 'string' ? event.reason.slice(0, 128) : '',
          session_id: sessionId,
        })
      } catch {
        // swallow
      }
      if (closedByUserRef.current) return

      // Application-defined close codes 4001..4099 are FATAL — retrying will
      // hit the same condition every time and burn the reconnect budget.
      //   4001 = unauthorised (token missing / decode failed)
      //   4003 = forbidden (user mismatch)
      //   4004 = session not found (backend restarted, or expired session)
      const FATAL_CLOSE_CODES = new Set([4001, 4003, 4004])
      if (FATAL_CLOSE_CODES.has(event.code)) {
        closedByUserRef.current = true
        const messages: Record<number, string> = {
          4001: 'Session token rejected — sign in again and reload.',
          4003: 'You are not allowed to view this lesson session.',
          4004: 'Lesson session expired or was cleared. Start a new lesson.',
        }
        dispatch({
          type: 'SET_STATUS',
          status: 'error',
          error: messages[event.code] ?? `Connection closed (${event.code})`,
          reconnectAttempt: attemptsRef.current,
        })
        return
      }

      if (attemptsRef.current >= RECONNECT_MAX_ATTEMPTS) {
        dispatch({
          type: 'SET_STATUS',
          status: 'error',
          error: `Connection lost after ${RECONNECT_MAX_ATTEMPTS} reconnect attempts`,
          reconnectAttempt: attemptsRef.current,
        })
        return
      }
      const nextAttempt = attemptsRef.current + 1
      attemptsRef.current = nextAttempt
      // Exponential backoff with jitter: 500ms, 1s, 2s, 4s, 8s (+ up to 250ms random)
      const delay = 500 * Math.pow(2, nextAttempt - 1) + Math.floor(Math.random() * 250)
      dispatch({
        type: 'SET_STATUS',
        status: 'reconnecting',
        error: null,
        reconnectAttempt: nextAttempt,
      })
      setTimeout(() => {
        if (!closedByUserRef.current) connect()
      }, delay)
    }
  }, [buildUrl, sessionId])

  useEffect(() => {
    if (!enabled) return
    closedByUserRef.current = false
    attemptsRef.current = 0
    connect()
    return () => {
      closedByUserRef.current = true
      const ws = wsRef.current
      wsRef.current = null
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        try { ws.close() } catch {}
      }
    }
  }, [enabled, connect])

  const sendAction = useCallback((msg: BoardClientAction) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try { ws.send(JSON.stringify(msg)) } catch {}
  }, [])

  const sendUserMessage = useCallback((text: string): boolean => {
    const trimmed = text.trim()
    if (!trimmed) return false
    const ws = wsRef.current
    const currentStatus = stateRef.current.status
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (currentStatus === 'done' || currentStatus === 'error') return false
      pendingMessagesRef.current.push(trimmed)
      dispatch({
        type: 'EVENT',
        event: {
          event_type: 'user_message',
          timestamp: Date.now(),
          data: { text: trimmed },
        } as UserMessageEvent,
      })
      return true
    }
    try {
      ws.send(JSON.stringify({ action: 'user_message', text: trimmed }))
      dispatch({
        type: 'EVENT',
        event: {
          event_type: 'user_message',
          timestamp: Date.now(),
          data: { text: trimmed },
        } as UserMessageEvent,
      })
      return true
    } catch {
      if (currentStatus === 'done' || currentStatus === 'error') return false
      pendingMessagesRef.current.push(trimmed)
      dispatch({
        type: 'EVENT',
        event: {
          event_type: 'user_message',
          timestamp: Date.now(),
          data: { text: trimmed },
        } as UserMessageEvent,
      })
      return true
    }
  }, [])

  const close = useCallback(() => {
    closedByUserRef.current = true
    const ws = wsRef.current
    wsRef.current = null
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      try { ws.close() } catch {}
    }
  }, [])

  // Hydrate the reducer with a previously persisted snapshot. Callers should
  // pass the backend-shaped `state` object (board / elements / element_order /
  // narration_log / audio_queue / chat_history / status / writingStatus).
  const hydrate = useCallback((snapshot: Record<string, unknown> | null | undefined) => {
    if (!snapshot || typeof snapshot !== 'object') return
    const s = snapshot as Record<string, unknown>
    // Re-derive elementOrder from the saved element_order (snake_case from
    // backend) but tolerate already-camelCased payloads too.
    const elementsRaw = (s.elements ?? {}) as Record<string, BoardElement>
    const orderRaw =
      (s.element_order as string[] | undefined) ??
      (s.elementOrder as string[] | undefined) ??
      Object.keys(elementsRaw)
    const narrationLogRaw =
      (s.narration_log as NarrationLog[] | undefined) ??
      (s.narrationLog as NarrationLog[] | undefined) ??
      []
    const audioQueueRaw =
      (s.audio_queue as AudioReady[] | undefined) ??
      (s.audioQueue as AudioReady[] | undefined) ??
      []
    const chatHistoryRaw =
      (s.chat_history as ChatMessage[] | undefined) ??
      (s.chatHistory as ChatMessage[] | undefined) ??
      []
    const audioByEl: Record<string, AudioReady> = {}
    for (const a of audioQueueRaw) {
      if (a && a.element_id) audioByEl[a.element_id] = a
    }
    const status = (s.status as BoardStatus | undefined) ?? 'idle'
    const writingStatus =
      (s.writingStatus as BoardWSState['writingStatus'] | undefined) ?? 'idle'
    dispatch({
      type: 'RESTORE_STATE',
      snapshot: {
        board: (s.board as BoardState | null | undefined) ?? null,
        elements: elementsRaw,
        elementOrder: orderRaw,
        narrationLog: narrationLogRaw,
        audioQueue: audioQueueRaw,
        audioByElementId: audioByEl,
        chatHistory: chatHistoryRaw,
        status,
        writingStatus,
      },
    })
  }, [])

  return { state, sendAction, sendUserMessage, close, hydrate }
}
