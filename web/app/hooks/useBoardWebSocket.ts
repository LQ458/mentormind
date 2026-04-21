'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type BoardLayout =
  | 'full_canvas'
  | 'split_left_right'
  | 'split_top_bottom'
  | 'focus_center'

export type BoardBackground = 'dark_board' | 'light_board' | 'grid' | 'plain'

export type ElementType =
  | 'title'
  | 'text_block'
  | 'equation'
  | 'graph'
  | 'shape'
  | 'transform'
  | 'code_block'
  | 'image'
  | 'definition_box'
  | 'theorem_box'
  | 'step_list'
  | 'arrow'
  | 'highlight'
  | 'table'

export type PositionRegion =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top_left'
  | 'top_right'
  | 'bottom_left'
  | 'bottom_right'

export type StyleColor =
  | 'accent'
  | 'heading'
  | 'text'
  | 'green'
  | 'mauve'
  | 'yellow'
  | 'red'

export type StyleSize = 'small' | 'medium' | 'large' | 'xlarge'

export type StyleAnimation = 'fade_in' | 'write' | 'grow' | 'slide_in' | 'none'

export interface ElementPosition {
  region: PositionRegion
  offset_x?: number
  offset_y?: number
}

export interface ElementStyle {
  color?: StyleColor
  size?: StyleSize
  animation?: StyleAnimation
}

export interface ElementMetadata {
  graph_expression?: string
  graph_x_range?: [number, number]
  graph_y_range?: [number, number]
  shape_type?: 'circle' | 'triangle' | 'rectangle' | 'line' | 'polygon' | 'arrow'
  transform_from?: string
  transform_to?: string
  code_language?: string
  table_headers?: string[]
  table_rows?: string[][]
  steps?: string[]
  arrow_from?: string
  arrow_to?: string
  highlight_target?: string
  [key: string]: unknown
}

export interface BoardElement {
  element_id: string
  element_type: ElementType
  content: string
  position: ElementPosition
  style: ElementStyle
  narration?: string
  metadata?: ElementMetadata
  /** Local-only decorators applied during streaming */
  state?: 'normal' | 'highlighted' | 'dim' | 'exiting'
}

export interface BoardState {
  board_id: string
  title: string
  layout: BoardLayout
  background: BoardBackground
  topic: string
}

export interface NarrationLog {
  element_id: string | null
  text: string
  timestamp: number
  pause_after_ms?: number
}

export interface AudioReady {
  element_id: string | null
  audio_path: string
  duration_ms: number
  narration_text: string
  timestamp: number
}

export interface AgentEvent {
  kind: 'start' | 'result' | 'error'
  agent: 'researcher' | 'coder' | 'writer' | 'critic'
  task?: string
  result?: string
  error?: string
  timestamp: number
}

// ── Discriminated WS events ──────────────────────────────────────────────────

interface BaseEvent {
  event_type: string
  timestamp: number
  element_id?: string | null
  data: Record<string, unknown>
}

interface BoardCreatedEvent extends BaseEvent {
  event_type: 'board_created'
  data: {
    board_id: string
    title: string
    layout: BoardLayout
    background: BoardBackground
    topic: string
  }
}

interface ElementAddedEvent extends BaseEvent {
  event_type: 'element_added'
  data: {
    element_id: string
    element_type: ElementType
    content: string
    position: ElementPosition
    style: ElementStyle
    narration?: string
    metadata?: ElementMetadata
  }
}

interface ElementUpdatedEvent extends BaseEvent {
  event_type: 'element_updated'
  data: {
    element_id: string
    action: 'highlight' | 'dim' | 'update_content' | 'move' | 'animate_transform' | 'remove'
    new_content?: string
    narration?: string
  }
}

interface BoardClearedEvent extends BaseEvent {
  event_type: 'board_cleared'
  data: {
    scope?: string
    region?: PositionRegion
    animation?: string
    removed_ids?: string[]
    narration?: string
  }
}

interface LayoutChangedEvent extends BaseEvent {
  event_type: 'layout_changed'
  data: {
    layout: BoardLayout
    transition?: string
  }
}

interface NarrationEvent extends BaseEvent {
  event_type: 'narration'
  data: {
    narration_text: string
    pause_after_ms?: number
  }
}

interface AudioReadyEvent extends BaseEvent {
  event_type: 'audio_ready'
  data: {
    audio_path: string
    duration_ms: number
    narration_text: string
  }
}

interface AudioErrorEvent extends BaseEvent {
  event_type: 'audio_error'
  data: { error: string; narration_text?: string }
}

interface NarrationPendingEvent extends BaseEvent {
  event_type: 'narration_pending'
  data: { narration_text: string }
}

interface ErrorEvent extends BaseEvent {
  event_type: 'error'
  data: { error: string; tool_name?: string }
}

interface AgentStartEvent extends BaseEvent {
  event_type: 'agent_start'
  data: { agent: AgentEvent['agent']; task: string }
}

interface AgentResultEvent extends BaseEvent {
  event_type: 'agent_result'
  data: { agent: AgentEvent['agent']; result: string }
}

interface AgentErrorEvent extends BaseEvent {
  event_type: 'agent_error'
  data: { agent: AgentEvent['agent']; error: string; tool_name?: string }
}

interface SummaryReadyEvent extends BaseEvent {
  event_type: 'summary_ready'
  data: { summary: string }
}

interface UserMessageEvent extends BaseEvent {
  event_type: 'user_message'
  data: { text: string }
}

interface StreamDoneEvent extends BaseEvent {
  event_type: 'stream_done' | 'done'
  data: Record<string, unknown>
}

export type BoardEvent =
  | BoardCreatedEvent
  | ElementAddedEvent
  | ElementUpdatedEvent
  | BoardClearedEvent
  | LayoutChangedEvent
  | NarrationEvent
  | AudioReadyEvent
  | AudioErrorEvent
  | NarrationPendingEvent
  | ErrorEvent
  | AgentStartEvent
  | AgentResultEvent
  | AgentErrorEvent
  | SummaryReadyEvent
  | UserMessageEvent
  | StreamDoneEvent

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

// ── Reducer state ────────────────────────────────────────────────────────────

export type BoardStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error'

export interface BoardWSState {
  board: BoardState | null
  elements: Record<string, BoardElement>
  elementOrder: string[]
  narrationLog: NarrationLog[]
  currentNarration: string | null
  agentActivity: AgentEvent[]
  summary: string | null
  audioByElementId: Record<string, AudioReady>
  audioQueue: AudioReady[]
  chatHistory: ChatMessage[]
  status: BoardStatus
  error: string | null
  writingStatus: 'idle' | 'writing' | 'narrating'
  writingElementId: string | null
}

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
  writingStatus: 'idle',
  writingElementId: null,
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
  writingStatus: 'idle',
  writingElementId: null,
}

type Action =
  | { type: 'SET_STATUS'; status: BoardStatus; error?: string | null }
  | { type: 'EVENT'; event: BoardEvent }
  | { type: 'RESET' }

function reducer(state: BoardWSState, action: Action): BoardWSState {
  switch (action.type) {
    case 'SET_STATUS':
      return { ...state, status: action.status, error: action.error ?? null }
    case 'RESET':
      return initialState
    case 'EVENT':
      return applyEvent(state, action.event)
    default:
      return state
  }
}

function coerceAgentText(v: unknown): string {
  if (typeof v === 'string') return v
  if (v == null) return ''
  try { return JSON.stringify(v) } catch { return String(v) }
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
    default:
      return state
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseBoardWebSocketOptions {
  sessionId: string
  token: string | null
  enabled: boolean
  backendWsUrl?: string
}

export type BoardClientAction =
  | { action: 'pause' | 'resume' }
  | { action: 'user_message'; text: string }

export function useBoardWebSocket(opts: UseBoardWebSocketOptions) {
  const { sessionId, token, enabled, backendWsUrl } = opts
  const [state, dispatch] = useReducer(reducer, initialState)
  const wsRef = useRef<WebSocket | null>(null)
  const attemptsRef = useRef(0)
  const closedByUserRef = useRef(false)

  const buildUrl = useCallback((): string | null => {
    if (!token) return null
    const envUrl = backendWsUrl || process.env.NEXT_PUBLIC_BACKEND_WS_URL
    if (envUrl) {
      const base = envUrl.replace(/\/$/, '')
      return `${base}/ws/board/${sessionId}?token=${encodeURIComponent(token)}`
    }
    if (typeof window === 'undefined') return null
    const { protocol, hostname, host } = window.location
    const scheme = protocol === 'https:' ? 'wss' : 'ws'
    // Next.js dev server can't proxy WS upgrades, so in dev we target the FastAPI backend directly.
    const isDev = hostname === 'localhost' || hostname === '127.0.0.1'
    if (!isDev) {
      // In production the browser cannot reach the docker service name, and
      // falling back to `host` would slam WS upgrades into the Next frontend,
      // which crashes it (handleRequestImpl bind error). Surface the misconfig
      // instead of looping reconnects into a 500.
      dispatch({
        type: 'SET_STATUS',
        status: 'error',
        error:
          'NEXT_PUBLIC_BACKEND_WS_URL is not configured. Set it to the backend WebSocket URL the browser can reach (e.g. wss://api.example.com) and rebuild the frontend.',
      })
      return null
    }
    return `${scheme}://${hostname}:8000/ws/board/${sessionId}?token=${encodeURIComponent(token)}`
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
      attemptsRef.current = 0
    }

    ws.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data as string) as BoardEvent
        if (!parsed || typeof parsed.event_type !== 'string') return
        dispatch({ type: 'EVENT', event: parsed })
        if (parsed.event_type === 'done' || parsed.event_type === 'stream_done') {
          // Lesson finished — treat the ensuing close as intentional so we don't retry with a stale token.
          closedByUserRef.current = true
        }
      } catch (err) {
        console.warn('[useBoardWebSocket] bad message', err)
      }
    }

    ws.onerror = () => {
      // Most browsers give no detail here; treat as transient.
    }

    ws.onclose = () => {
      wsRef.current = null
      if (closedByUserRef.current) return
      if (attemptsRef.current >= 3) {
        dispatch({ type: 'SET_STATUS', status: 'error', error: 'WebSocket closed' })
        return
      }
      const delay = 500 * Math.pow(2, attemptsRef.current)
      attemptsRef.current += 1
      setTimeout(() => {
        if (!closedByUserRef.current) connect()
      }, delay)
    }
  }, [buildUrl])

  useEffect(() => {
    if (!enabled || !token) return
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
  }, [enabled, token, connect])

  const sendAction = useCallback((msg: BoardClientAction) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    try { ws.send(JSON.stringify(msg)) } catch {}
  }, [])

  const sendUserMessage = useCallback((text: string): boolean => {
    const trimmed = text.trim()
    if (!trimmed) return false
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    try {
      ws.send(JSON.stringify({ action: 'user_message', text: trimmed }))
      return true
    } catch {
      return false
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

  return { state, sendAction, sendUserMessage, close }
}
