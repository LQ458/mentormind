'use client'

// Dev-only harness (public, no auth) to exercise the Phase 1 learner-paced UI
// with real useBoardPacing + the real components, driven by mock segmented
// board state. Mirrors how board/[sessionId]/page.tsx wires pacing, minus the
// WebSocket. Use /board-pacing-test for browser/Playwright UI testing.

import React, { useState } from 'react'
import BoardCanvas from '../components/board/BoardCanvas'
import BoardInviteCard from '../components/board/BoardInviteCard'
import BoardRecapCheck from '../components/board/BoardRecapCheck'
import { useBoardPacing } from '../hooks/useBoardPacing'
import type {
  BoardElement,
  BoardWSState,
  SegmentInvite,
  ComprehensionCheckData,
} from '../hooks/useBoardWebSocket'

function mkEl(
  id: string,
  segIdx: number,
  type: BoardElement['element_type'],
  content: string,
  narration: string,
  extra: Partial<BoardElement> = {},
): BoardElement {
  return {
    element_id: id,
    element_type: type,
    content,
    position: { region: 'center' },
    style: { animation: 'fade_in', size: 'medium', color: 'text' },
    narration,
    state: 'normal',
    metadata: { segment_index: segIdx, ...(extra.metadata || {}) },
    ...extra,
  }
}

// 3 segments × 2 narrated elements each.
const ELEMENTS: BoardElement[] = [
  mkEl('s0-title', 0, 'title', 'Limits & Continuity', 'Welcome — today we explore limits.', {
    style: { size: 'xlarge', color: 'heading', animation: 'fade_in' },
  }),
  mkEl('s0-def', 0, 'definition_box', 'A limit is the value f(x) approaches as x → a.', 'A limit describes approach, not arrival.', {
    style: { size: 'medium', color: 'accent', animation: 'grow' },
    metadata: { segment_index: 0, title: 'Definition' },
  }),
  mkEl('s1-eq', 1, 'equation', '\\lim_{x \\to a} f(x) = L', 'Formally, the limit equals L.', {
    style: { size: 'large', color: 'heading', animation: 'write' },
  }),
  mkEl('s1-graph', 1, 'graph', 'y = x² near x = 1', 'Watch the curve approach.', {
    style: { size: 'medium', color: 'accent', animation: 'fade_in' },
    metadata: { segment_index: 1, graph_expression: 'x**2', graph_x_range: [-3, 3], graph_y_range: [-1, 9] },
  }),
  mkEl('s2-thm', 2, 'theorem_box', 'If f is continuous at a, lim f(x) = f(a).', 'Continuity ties the limit to the value.', {
    style: { size: 'medium', color: 'green', animation: 'grow' },
    metadata: { segment_index: 2, title: 'Theorem' },
  }),
  mkEl('s2-text', 2, 'text_block', 'Recap: a limit is about approach; continuity makes it land.', 'To summarize the key idea.', {
    style: { size: 'medium', color: 'text', animation: 'fade_in' },
  }),
]

export default function BoardPacingTestPage() {
  const [pendingInvite, setPendingInvite] = useState<SegmentInvite | null>(null)
  const [pendingCheck, setPendingCheck] = useState<ComprehensionCheckData | null>(null)
  const [recapKey, setRecapKey] = useState(0)
  const [chatLog, setChatLog] = useState<string[]>([])

  const state: BoardWSState = {
    board: { board_id: 'pacing-test', title: 'Pacing Test', layout: 'focus_center', background: 'dark_board', topic: 'Limits' },
    elements: Object.fromEntries(ELEMENTS.map(e => [e.element_id, e])),
    elementOrder: ELEMENTS.map(e => e.element_id),
    narrationLog: [],
    currentNarration: null,
    agentActivity: [],
    summary: null,
    audioByElementId: {},
    audioQueue: [],
    chatHistory: [],
    status: 'streaming',
    error: null,
    reconnectAttempt: 0,
    writingStatus: 'idle',
    writingElementId: null,
    pendingInvite,
    pendingCheck,
  }

  const pacing = useBoardPacing(state)
  const send = (t: string) => setChatLog(l => [...l, t])

  // Simulate the current revealed segment's narration finishing → unlocks continue.
  const completeCurrentAudio = () => {
    const seg = pacing.segments[pacing.revealedSegments - 1]
    seg?.audioElementIds.forEach(id => pacing.markAudioEnded(id))
  }

  const btn = 'text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col" data-testid="pacing-test-root">
      <header className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/80">
        <h1 className="text-sm font-semibold mr-2">Pacing Test Harness</h1>
        <button className={btn} data-testid="complete-audio" onClick={completeCurrentAudio}>Finish segment audio</button>
        <button className={btn} data-testid="toggle-mode" onClick={() => pacing.setPacingMode(pacing.pacingMode === 'autoplay' ? 'learner_paced' : 'autoplay')}>Mode: {pacing.pacingMode}</button>
        <button className={btn} data-testid="inject-invite" onClick={() => setPendingInvite({ kind: 'choose', prompt: 'Which best describes a limit?', options: ['The value at a', 'The value approached near a', 'Always infinity'] })}>Inject invite</button>
        <button className={btn} data-testid="inject-recap" onClick={() => { setPendingCheck({ question: 'In your own words, what is the key idea?', segment_summary: 'Limits', allow_emoji: true }); setRecapKey(k => k + 1) }}>Inject recap</button>
        <span className="text-xs text-slate-400 ml-2" data-testid="pacing-state">
          revealed={pacing.revealedSegments}/{pacing.totalSegments} cap={pacing.revealedElementCount} canContinue={String(pacing.canContinue)} mode={pacing.pacingMode}
        </span>
      </header>

      <main className="flex-1 min-h-0 px-4 py-4">
        <div className="relative w-full h-[calc(100vh-150px)]">
          <BoardCanvas state={state} revealedElementCount={pacing.revealedElementCount} />
          {pacing.currentInvite && (
            <BoardInviteCard invite={pacing.currentInvite} language="en" onSend={send} onDismiss={pacing.dismissInvite} />
          )}
          {state.pendingCheck && (
            <BoardRecapCheck key={recapKey} check={state.pendingCheck} language="en" onAsk={send} />
          )}
          {pacing.canContinue && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40">
              <button
                type="button"
                data-testid="continue"
                onClick={pacing.continueToNext}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-400/70 bg-emerald-600/90 px-5 py-2.5 text-sm font-medium text-emerald-50 shadow-lg hover:bg-emerald-600"
              >
                <span aria-hidden>▶</span> Continue
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="px-4 py-2 border-t border-slate-800 bg-slate-900/80 text-xs text-slate-400" data-testid="chatlog">
        sent: {chatLog.join(' | ') || '(none)'}
      </footer>
    </div>
  )
}
