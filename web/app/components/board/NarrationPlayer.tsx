'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { AudioReady, NarrationLog } from '../../hooks/useBoardWebSocket'

interface NarrationPlayerProps {
  audioQueue: AudioReady[]
  onPlaybackStart: (elementId: string | null, text: string) => void
  onPlaybackEnd: (elementId: string | null) => void
  enabled: boolean
  language?: 'en' | 'zh'
  /**
   * Narration entries in arrival order (typically `state.narrationLog`).
   * Used by the Web Speech fallback to detect element narrations that have
   * no incoming TTS audio (e.g. ``BOARD_FAST_MODE`` is on or the backend
   * synthesizer failed). When undefined, fallback is disabled.
   */
  narrationLog?: NarrationLog[]
  /**
   * Map of element_id → AudioReady that the WS hook maintains. The fallback
   * skips any narration whose element_id has a real audio track. When
   * undefined, fallback is disabled.
   */
  audioByElementId?: Record<string, AudioReady>
  /**
   * Enable the Web Speech fallback. Pass true when ``BOARD_FAST_MODE`` is on
   * or the user opted into client-side narration.
   */
  fallbackEnabled?: boolean
  /** Milliseconds to wait for backend audio before falling back. */
  fallbackWaitMs?: number
}

export default function NarrationPlayer({
  audioQueue,
  onPlaybackStart,
  onPlaybackEnd,
  enabled,
  language = 'en',
  narrationLog,
  audioByElementId,
  fallbackEnabled = false,
  fallbackWaitMs = 1000,
}: NarrationPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [muted, setMuted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [speed, setSpeed] = useState<number>(1)

  const currentTrack = cursor < audioQueue.length ? audioQueue[cursor] : null

  // Reset cursor if the queue is shortened (e.g., board cleared)
  useEffect(() => {
    if (cursor > audioQueue.length) setCursor(audioQueue.length)
  }, [audioQueue.length, cursor])

  // Resolve backend-served audio through the Next media proxy. Older board
  // sessions may still contain /api/files paths emitted before the proxy URL fix.
  const resolveAudioSrc = (path: string): string => {
    if (!path) return path
    if (/^https?:\/\//i.test(path) || path.startsWith('blob:') || path.startsWith('data:')) return path
    if (path.startsWith('/api/files/')) {
      return `/api/backend/media/${path.replace(/^\/api\/files\//, '')}`
    }
    return path
  }

  // Immediately reflect mute / pause / enabled state on the audio element so toggles
  // take effect mid-segment instead of waiting for the next track to load.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.muted = muted
  }, [muted])

  // Keep audio playback rate in sync with the user-selected speed.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.playbackRate = speed
  }, [speed])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    if (!enabled || paused) {
      el.pause()
    } else if (currentTrack && el.paused && el.src) {
      void el.play().catch(() => {})
    }
  }, [enabled, paused, currentTrack])

  // Auto-play current track
  useEffect(() => {
    if (!enabled || paused || !currentTrack) return
    const el = audioRef.current
    if (!el) return
    el.src = resolveAudioSrc(currentTrack.audio_path)
    el.muted = muted
    el.playbackRate = speed
    onPlaybackStart(currentTrack.element_id, currentTrack.narration_text)
    const playPromise = el.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Autoplay blocked; skip to next so UI keeps moving.
        setCursor(c => c + 1)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.audio_path, enabled])

  const handleEnded = () => {
    if (currentTrack) onPlaybackEnd(currentTrack.element_id)
    setCursor(c => c + 1)
  }

  // ── Web Speech API fallback ───────────────────────────────────────────────
  // Tracks element_ids we already kicked off via speechSynthesis so we don't
  // double-speak when narrationLog re-renders.
  const spokenIdsRef = useRef<Set<string>>(new Set())
  // Active utterances keyed by element_id so we can cancel one if real audio
  // arrives later.
  const activeUtterancesRef = useRef<Map<string, SpeechSynthesisUtterance>>(new Map())
  // Pending fallback timers, keyed by element_id, so they can be cleared if
  // backend audio arrives within the wait window.
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // If real audio shows up for an element we previously spoke (or have a
  // pending timer for), cancel the local speech.
  useEffect(() => {
    if (!fallbackEnabled || !audioByElementId) return
    const ids = Object.keys(audioByElementId)
    if (ids.length === 0) return
    for (const id of ids) {
      const t = pendingTimersRef.current.get(id)
      if (t) {
        clearTimeout(t)
        pendingTimersRef.current.delete(id)
      }
      const utter = activeUtterancesRef.current.get(id)
      if (utter) {
        try { window.speechSynthesis.cancel() } catch {}
        activeUtterancesRef.current.delete(id)
      }
    }
  }, [audioByElementId, fallbackEnabled])

  // Schedule fallback for fresh narrationLog entries without matching audio.
  useEffect(() => {
    if (!fallbackEnabled) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    if (!narrationLog || narrationLog.length === 0) return
    const map = audioByElementId || {}
    for (const entry of narrationLog) {
      const id = entry.element_id
      if (!id) continue
      if (spokenIdsRef.current.has(id)) continue
      if (map[id]) continue
      if (pendingTimersRef.current.has(id)) continue
      const text = entry.text
      if (!text || !text.trim()) continue
      const lang = pickLanguageTag(language)
      const timer = setTimeout(() => {
        pendingTimersRef.current.delete(id)
        // Re-check at fire time: if real audio arrived in the wait window,
        // skip the fallback entirely.
        if ((audioByElementId || {})[id]) return
        if (!enabled || paused || muted) return
        try {
          const utter = new SpeechSynthesisUtterance(text)
          utter.lang = lang
          utter.rate = speed
          activeUtterancesRef.current.set(id, utter)
          utter.onstart = () => onPlaybackStart(id, text)
          utter.onend = () => {
            activeUtterancesRef.current.delete(id)
            onPlaybackEnd(id)
          }
          utter.onerror = () => {
            activeUtterancesRef.current.delete(id)
            onPlaybackEnd(id)
          }
          spokenIdsRef.current.add(id)
          window.speechSynthesis.speak(utter)
        } catch {
          // Silently ignore; fallback is best-effort.
        }
      }, fallbackWaitMs)
      pendingTimersRef.current.set(id, timer)
    }
  }, [narrationLog, audioByElementId, fallbackEnabled, fallbackWaitMs, language, enabled, paused, muted, speed, onPlaybackStart, onPlaybackEnd])

  // Clean up timers/utterances on unmount.
  useEffect(() => {
    const timers = pendingTimersRef.current
    const utterances = activeUtterancesRef.current
    return () => {
      timers.forEach((t) => clearTimeout(t))
      timers.clear()
      utterances.clear()
      try {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel()
        }
      } catch {}
    }
  }, [])

  return (
    <div className="inline-flex items-center gap-2">
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onError={handleEnded}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => setPaused(p => !p)}
        className="h-9 inline-flex items-center whitespace-nowrap text-xs px-3 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
        aria-pressed={paused}
        aria-label={paused ? 'Resume audio narration' : 'Pause audio narration'}
        title={paused ? 'Resume audio narration' : 'Pause audio narration'}
      >
        {language === 'zh'
          ? paused ? '继续朗读' : '暂停朗读'
          : paused ? 'Resume audio' : 'Pause audio'}
      </button>
      <button
        type="button"
        onClick={() => setMuted(m => !m)}
        className="h-9 inline-flex items-center whitespace-nowrap text-xs px-3 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
        aria-pressed={muted}
      >
        {language === 'zh'
          ? muted ? '取消静音' : '静音'
          : muted ? 'Unmute' : 'Mute'}
      </button>
      <label className="inline-flex items-center gap-1">
        <span className="sr-only">
          {language === 'zh' ? '朗读速度 Playback speed' : 'Playback speed'}
        </span>
        <select
          value={speed}
          onChange={e => setSpeed(Number(e.target.value))}
          aria-label={language === 'zh' ? '朗读速度 Playback speed' : 'Playback speed'}
          title={language === 'zh' ? '朗读速度 Playback speed' : 'Playback speed'}
          className="h-9 text-xs px-3 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-500"
        >
          <option value={0.8}>0.8×</option>
          <option value={1}>1×</option>
          <option value={1.25}>1.25×</option>
          <option value={1.5}>1.5×</option>
          <option value={2}>2×</option>
        </select>
      </label>
    </div>
  )
}

function pickLanguageTag(lang: 'en' | 'zh' | string | undefined): string {
  if (!lang) return 'en-US'
  const lower = String(lang).toLowerCase()
  if (lower.startsWith('zh')) return 'zh-CN'
  if (lower.startsWith('en')) return 'en-US'
  return lower
}
