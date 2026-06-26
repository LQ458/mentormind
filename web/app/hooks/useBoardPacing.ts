'use client'

// Learner-paced board pacing (v2 — Phase 1 frontend).
//
// A pure CONSUMER of the BoardWSState produced by useBoardWebSocket. It groups
// the streamed elements into segments using the per-element
// `metadata.segment_index` the backend stamps (see board state_manager), then
// gates reveal + audio so the lesson advances one "complete idea" at a time and
// the learner pulls the next segment with a "continue" control.
//
// Why a separate hook (not in useBoardWebSocket): that hook is a size-baselined
// god-module that may not grow. segment_index already flows through untouched on
// each element, so all pacing is derived here with ZERO changes to the WS hook.
//
// Safe fallbacks (no forced stops):
//   - No element carries a segment_index (e.g. backend not yet deployed, or an
//     older resumed snapshot) -> everything collapses into one segment ->
//     nothing is gated -> behaviour is identical to today (continuous play).
//   - `autoplay` mode reveals everything and disables gating in real time; it is
//     the escape hatch for learners who just want to watch. Flipping modes never
//     hides content the learner has already seen.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoardWSState, BoardElement } from './useBoardWebSocket'

export type PacingMode = 'learner_paced' | 'autoplay'

export interface BoardSegment {
  /** The segment_index value shared by this segment's elements. */
  index: number
  /** All element ids in this segment, in board order. */
  elementIds: string[]
  /** Subset that carries narration — i.e. the audio the client must finish
   *  before the segment counts as "heard" and a continue is offered. */
  audioElementIds: string[]
}

export interface UseBoardPacingResult {
  pacingMode: PacingMode
  setPacingMode: (mode: PacingMode) => void
  segments: BoardSegment[]
  totalSegments: number
  /** How many segments are currently unlocked (>=1 once content exists). */
  revealedSegments: number
  /** Element-count cap for BoardCanvas to slice on (all elements when autoplay
   *  or when there is no segment data). */
  revealedElementCount: number
  /** Element ids the NarrationPlayer is allowed to play. `undefined` disables
   *  gating entirely (autoplay / no segments). */
  playableElementIds: ReadonlySet<string> | undefined
  /** True when the current segment's narration has finished AND a further
   *  segment exists — i.e. show the "continue" affordance. */
  canContinue: boolean
  /** Unlock the next segment. No-op in autoplay or at the last segment. */
  continueToNext: () => void
  /** Feed playback-completion back in (call from NarrationPlayer.onPlaybackEnd). */
  markAudioEnded: (elementId: string | null) => void
  /** All revealed segments are shown (nothing left to unlock). */
  isFullyRevealed: boolean
}

function readSegmentIndex(el: BoardElement | undefined): number {
  const raw = el?.metadata?.segment_index
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

function defaultPacingMode(): PacingMode {
  const env = process.env.NEXT_PUBLIC_BOARD_PACING_MODE
  return env === 'autoplay' ? 'autoplay' : 'learner_paced'
}

/**
 * Group the board's ordered elements into contiguous segments. segment_index is
 * non-decreasing along elementOrder (the backend stamps the current segment and
 * only advances it at a boundary), so bucketing by value preserves order.
 */
function buildSegments(
  elements: Record<string, BoardElement>,
  elementOrder: string[],
): BoardSegment[] {
  const out: BoardSegment[] = []
  const byIndex = new Map<number, BoardSegment>()
  for (const id of elementOrder) {
    const el = elements[id]
    if (!el) continue
    const idx = readSegmentIndex(el)
    let seg = byIndex.get(idx)
    if (!seg) {
      seg = { index: idx, elementIds: [], audioElementIds: [] }
      byIndex.set(idx, seg)
      out.push(seg)
    }
    seg.elementIds.push(id)
    if (el.narration && el.narration.trim()) seg.audioElementIds.push(id)
  }
  out.sort((a, b) => a.index - b.index)
  return out
}

export function useBoardPacing(state: BoardWSState): UseBoardPacingResult {
  const [pacingMode, setPacingMode] = useState<PacingMode>(defaultPacingMode)
  // Starts at 1 (first segment unlocked). NOTE (Phase 1b): on resume-from-snapshot
  // of an *in-progress* lesson this resets to 1, so the learner re-advances
  // through already-seen segments. Fix by persisting this in the snapshot or
  // auto-revealing existing segments on hydrate; the autoplay toggle and the
  // status==='done' reveal-all override are the interim escapes.
  const [revealedSegments, setRevealedSegments] = useState(1)
  const [completedAudioIds, setCompletedAudioIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )

  const segments = useMemo(
    () => buildSegments(state.elements, state.elementOrder),
    [state.elements, state.elementOrder],
  )
  const totalSegments = segments.length

  // Reveal everything (and stop gating) in autoplay, and also once the lesson is
  // finished — a learner reviewing a completed or resumed-complete lesson should
  // not have to click through segments again.
  const revealAll = pacingMode === 'autoplay' || state.status === 'done'

  // Reset pacing when a different board loads (new lesson / hard reset).
  const boardId = state.board?.board_id ?? null
  const lastBoardIdRef = useRef<string | null>(boardId)
  useEffect(() => {
    if (lastBoardIdRef.current === boardId) return
    lastBoardIdRef.current = boardId
    setRevealedSegments(1)
    setCompletedAudioIds(new Set<string>())
  }, [boardId])

  // In autoplay, keep every generated segment unlocked. Doing this by advancing
  // the same counter (rather than a separate "reveal all" flag) means switching
  // back to learner_paced never collapses already-seen content — only future
  // segments get gated again.
  useEffect(() => {
    if (pacingMode !== 'autoplay') return
    if (totalSegments > revealedSegments) setRevealedSegments(totalSegments)
  }, [pacingMode, totalSegments, revealedSegments])

  const effectiveRevealed =
    totalSegments === 0
      ? 0
      : revealAll
        ? totalSegments
        : Math.min(Math.max(revealedSegments, 1), totalSegments)

  const revealedSegmentList = useMemo(
    () => segments.slice(0, effectiveRevealed),
    [segments, effectiveRevealed],
  )

  const revealedElementCount = useMemo(
    () => revealedSegmentList.reduce((sum, seg) => sum + seg.elementIds.length, 0),
    [revealedSegmentList],
  )

  const playableElementIds = useMemo(() => {
    if (revealAll) return undefined
    const ids = new Set<string>()
    for (const seg of revealedSegmentList) {
      for (const id of seg.elementIds) ids.add(id)
    }
    return ids
  }, [revealAll, revealedSegmentList])

  // The current segment's narration is "heard" when every narrated element in it
  // has completed playback. A segment with no narration counts as heard at once.
  const currentSegment = effectiveRevealed > 0 ? segments[effectiveRevealed - 1] : undefined
  const currentSegmentHeard = useMemo(() => {
    if (!currentSegment) return false
    if (currentSegment.audioElementIds.length === 0) return true
    return currentSegment.audioElementIds.every(id => completedAudioIds.has(id))
  }, [currentSegment, completedAudioIds])

  const isFullyRevealed = totalSegments === 0 || effectiveRevealed >= totalSegments
  const canContinue =
    pacingMode === 'learner_paced' && !isFullyRevealed && currentSegmentHeard

  const continueToNext = useCallback(() => {
    setRevealedSegments(r => r + 1)
  }, [])

  const markAudioEnded = useCallback((elementId: string | null) => {
    if (!elementId) return
    setCompletedAudioIds(prev => {
      if (prev.has(elementId)) return prev
      const next = new Set(prev)
      next.add(elementId)
      return next
    })
  }, [])

  return {
    pacingMode,
    setPacingMode,
    segments,
    totalSegments,
    revealedSegments: effectiveRevealed,
    revealedElementCount,
    playableElementIds,
    canContinue,
    continueToNext,
    markAudioEnded,
    isFullyRevealed,
  }
}
