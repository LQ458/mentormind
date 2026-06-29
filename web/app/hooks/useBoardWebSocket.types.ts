// Board WebSocket type surface.
//
// Pure type/interface declarations extracted from useBoardWebSocket.ts so that
// the size-baselined hook module (≤ 998 code lines) has room to grow without
// regressing the 字数规范 ratchet. useBoardWebSocket.ts re-exports everything
// here via `export * from './useBoardWebSocket.types'`, so every existing
// consumer importing from '.../useBoardWebSocket' keeps resolving unchanged.

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

export interface BaseEvent {
  event_type: string
  timestamp: number
  element_id?: string | null
  data: Record<string, unknown>
}

export interface BoardCreatedEvent extends BaseEvent {
  event_type: 'board_created'
  data: {
    board_id: string
    title: string
    layout: BoardLayout
    background: BoardBackground
    topic: string
  }
}

export interface ElementAddedEvent extends BaseEvent {
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

export interface ElementUpdatedEvent extends BaseEvent {
  event_type: 'element_updated'
  data: {
    element_id: string
    action: 'highlight' | 'dim' | 'update_content' | 'move' | 'animate_transform' | 'remove'
    new_content?: string
    narration?: string
  }
}

export interface BoardClearedEvent extends BaseEvent {
  event_type: 'board_cleared'
  data: {
    scope?: string
    region?: PositionRegion
    animation?: string
    removed_ids?: string[]
    narration?: string
  }
}

export interface LayoutChangedEvent extends BaseEvent {
  event_type: 'layout_changed'
  data: {
    layout: BoardLayout
    transition?: string
  }
}

export interface NarrationEvent extends BaseEvent {
  event_type: 'narration'
  data: {
    narration_text: string
    pause_after_ms?: number
  }
}

export interface AudioReadyEvent extends BaseEvent {
  event_type: 'audio_ready'
  data: {
    audio_path: string
    duration_ms: number
    narration_text: string
  }
}

export interface AudioErrorEvent extends BaseEvent {
  event_type: 'audio_error'
  data: { error: string; narration_text?: string }
}

export interface NarrationPendingEvent extends BaseEvent {
  event_type: 'narration_pending'
  data: { narration_text: string }
}

export interface ErrorEvent extends BaseEvent {
  event_type: 'error'
  data: { error: string; tool_name?: string }
}

export interface AgentStartEvent extends BaseEvent {
  event_type: 'agent_start'
  data: { agent: AgentEvent['agent']; task: string }
}

export interface AgentResultEvent extends BaseEvent {
  event_type: 'agent_result'
  data: { agent: AgentEvent['agent']; result: string }
}

export interface AgentErrorEvent extends BaseEvent {
  event_type: 'agent_error'
  data: { agent: AgentEvent['agent']; error: string; tool_name?: string }
}

export interface SummaryReadyEvent extends BaseEvent {
  event_type: 'summary_ready'
  data: { summary: string }
}

export interface UserMessageEvent extends BaseEvent {
  event_type: 'user_message'
  data: { text: string }
}

export interface StreamDoneEvent extends BaseEvent {
  event_type: 'stream_done' | 'done'
  data: Record<string, unknown>
}

export interface SessionStateEvent extends BaseEvent {
  event_type: 'session_state'
  data: Record<string, unknown>
}

// F2 — mid-lesson comprehension checkpoint (emitted by backend; paused on FE)
export interface ComprehensionCheckEvent extends BaseEvent {
  event_type: 'comprehension_check'
  data: {
    question?: string
    options?: string[]
    segment_summary?: string
    allow_emoji?: boolean
  }
}

// Phase 1b — optional non-blocking inline invite attached to a segment boundary.
export interface SegmentInvite {
  kind: 'predict' | 'choose' | 'restate' | 'do_step'
  prompt: string
  options?: string[]
  element_id?: string
}

export interface SegmentBoundaryEvent extends BaseEvent {
  event_type: 'segment_boundary'
  data: {
    segment_index: number
    element_ids?: string[]
    audio_element_ids?: string[]
    expected_audio_count?: number
    is_last_segment?: boolean
    invite?: SegmentInvite
  }
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
  | SessionStateEvent
  | ComprehensionCheckEvent
  | SegmentBoundaryEvent

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

// ── Reducer state ────────────────────────────────────────────────────────────

export type BoardStatus = 'idle' | 'connecting' | 'open' | 'streaming' | 'reconnecting' | 'done' | 'error'

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
  reconnectAttempt: number
  writingStatus: 'idle' | 'writing' | 'narrating'
  writingElementId: string | null
  /** Optional so board-replay / board-test snapshot construction stays valid. */
  pendingInvite?: SegmentInvite | null
}

// ── Hook options ─────────────────────────────────────────────────────────────

export interface UseBoardWebSocketOptions {
  sessionId: string
  token: string | null
  enabled: boolean
  backendWsUrl?: string
}

export type BoardClientAction =
  | { action: 'pause' | 'resume' }
  | { action: 'user_message'; text: string }
