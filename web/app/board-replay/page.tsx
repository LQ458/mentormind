'use client'

import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import BoardCanvas from '../components/board/BoardCanvas'
import {
  INITIAL_BOARD_STATE,
  applyBoardEvent,
  type BoardEvent,
  type BoardWSState,
} from '../hooks/useBoardWebSocket'

interface ReplayFixture {
  topic?: string
  language?: string
  events: BoardEvent[]
}

type ReducerAction =
  | { type: 'RESET' }
  | { type: 'APPLY'; event: BoardEvent }

function reducer(state: BoardWSState, action: ReducerAction): BoardWSState {
  switch (action.type) {
    case 'RESET':
      return INITIAL_BOARD_STATE
    case 'APPLY':
      return applyBoardEvent(state, action.event)
  }
}

const DEFAULT_FIXTURE = 'derivatives-and-rates-of-change'
const FIXTURE_OPTIONS = [
  'derivatives-and-rates-of-change',
  'the-pythagorean-theorem',
  'photosynthesis',
  'ohm-s-law',
  'niu-dun-di-er-ding-lu',
  'gou-gu-ding-li',
  'basic-probability',
  'supply-and-demand',
  'linear-equations',
  'dna-replication',
]

export default function BoardReplayPage() {
  const [state, dispatch] = useReducer(reducer, INITIAL_BOARD_STATE)
  const [fixture, setFixture] = useState<ReplayFixture | null>(null)
  const [fixtureName, setFixtureName] = useState(DEFAULT_FIXTURE)
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(80)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  // Load fixture JSON
  useEffect(() => {
    let active = true
    setError(null)
    fetch(`/fixtures/${fixtureName}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((j: ReplayFixture) => {
        if (!active) return
        setFixture(j)
        setCursor(0)
        dispatch({ type: 'RESET' })
      })
      .catch((e: Error) => {
        if (active) setError(`Could not load fixture: ${e.message}`)
      })
    return () => { active = false }
  }, [fixtureName])

  // Playback loop
  useEffect(() => {
    if (!playing || !fixture) return
    if (cursor >= fixture.events.length) { setPlaying(false); return }
    timerRef.current = window.setTimeout(() => {
      dispatch({ type: 'APPLY', event: fixture.events[cursor] })
      setCursor(c => c + 1)
    }, speed)
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [playing, cursor, fixture, speed])

  const onStart = () => { dispatch({ type: 'RESET' }); setCursor(0); setPlaying(true) }
  const onPause = () => setPlaying(p => !p)
  const onStep = () => {
    if (!fixture) return
    if (cursor >= fixture.events.length) return
    dispatch({ type: 'APPLY', event: fixture.events[cursor] })
    setCursor(c => c + 1)
  }
  const onSkipToEnd = () => {
    if (!fixture) return
    setPlaying(false)
    for (let i = cursor; i < fixture.events.length; i++) {
      dispatch({ type: 'APPLY', event: fixture.events[i] })
    }
    setCursor(fixture.events.length)
  }

  const stats = useMemo(() => {
    if (!fixture) return null
    const seen = fixture.events.slice(0, cursor)
    const byType: Record<string, number> = {}
    for (const e of seen) byType[e.event_type] = (byType[e.event_type] || 0) + 1
    return { total: fixture.events.length, byType }
  }, [fixture, cursor])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-slate-800 bg-slate-900/80">
        <h1 className="text-sm font-semibold">Board Replay</h1>
        <select
          value={fixtureName}
          onChange={e => setFixtureName(e.target.value)}
          className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1"
          data-testid="replay-fixture"
        >
          {FIXTURE_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <span className="text-xs text-slate-400">
          {fixture ? `${cursor}/${fixture.events.length}` : (error ?? 'loading…')}
        </span>
        <div className="ml-auto flex gap-2 items-center">
          <label className="text-xs text-slate-400">speed</label>
          <input
            type="range"
            min={10}
            max={500}
            step={10}
            value={speed}
            onChange={e => setSpeed(parseInt(e.target.value, 10))}
          />
          <span className="text-xs text-slate-400 w-10">{speed}ms</span>
          <button onClick={onStart} className="text-xs px-3 py-1.5 rounded-lg border border-sky-500/60 bg-sky-600/30 text-sky-100 hover:bg-sky-600/50" data-testid="replay-start">Restart</button>
          <button onClick={onPause} className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700" data-testid="replay-pause">{playing ? 'Pause' : 'Play'}</button>
          <button onClick={onStep} className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/60 bg-emerald-600/30 text-emerald-100 hover:bg-emerald-600/50" data-testid="replay-step">Step</button>
          <button onClick={onSkipToEnd} className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/60 bg-amber-600/30 text-amber-100 hover:bg-amber-600/50" data-testid="replay-skip">Skip to end</button>
          <button onClick={() => setPaused(p => !p)} className="text-xs px-3 py-1.5 rounded-lg border border-rose-500/60 bg-rose-600/30 text-rose-100 hover:bg-rose-600/50" data-testid="replay-user-pause">{paused ? 'Resume UI' : 'Pause UI'}</button>
        </div>
      </header>
      {stats && (
        <div className="px-6 py-1 text-[10px] text-slate-400 flex gap-3 flex-wrap" data-testid="replay-stats">
          {Object.entries(stats.byType).map(([k, v]) => (
            <span key={k}>{k}:{v}</span>
          ))}
        </div>
      )}
      <main className="flex-1 min-h-0 px-4 sm:px-6 py-4">
        <div className="relative w-full h-[calc(100vh-140px)]">
          <BoardCanvas state={state} paused={paused} />
        </div>
      </main>
    </div>
  )
}
