'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { AudioReady } from '../../hooks/useBoardWebSocket'

interface NarrationPlayerProps {
  audioQueue: AudioReady[]
  onPlaybackStart: (elementId: string | null, text: string) => void
  onPlaybackEnd: (elementId: string | null) => void
  enabled: boolean
}

export default function NarrationPlayer({
  audioQueue,
  onPlaybackStart,
  onPlaybackEnd,
  enabled,
}: NarrationPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [muted, setMuted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [cursor, setCursor] = useState(0)

  const currentTrack = cursor < audioQueue.length ? audioQueue[cursor] : null

  // Reset cursor if the queue is shortened (e.g., board cleared)
  useEffect(() => {
    if (cursor > audioQueue.length) setCursor(audioQueue.length)
  }, [audioQueue.length, cursor])

  // Resolve a backend-served audio path to an absolute URL the browser can fetch.
  // In dev, the Next dev server (:3000) can't proxy /api/files, so point at backend :8000.
  const resolveAudioSrc = (path: string): string => {
    if (!path) return path
    if (/^https?:\/\//i.test(path) || path.startsWith('blob:') || path.startsWith('data:')) return path
    if (typeof window === 'undefined') return path
    const { hostname, protocol } = window.location
    const isDev = hostname === 'localhost' || hostname === '127.0.0.1'
    if (isDev && path.startsWith('/')) return `${protocol}//${hostname}:8000${path}`
    return path
  }

  // Immediately reflect mute / pause / enabled state on the audio element so toggles
  // take effect mid-segment instead of waiting for the next track to load.
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.muted = muted
  }, [muted])

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
        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
        aria-pressed={paused}
      >
        {paused ? 'Resume' : 'Pause'}
      </button>
      <button
        type="button"
        onClick={() => setMuted(m => !m)}
        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
        aria-pressed={muted}
      >
        {muted ? 'Unmute' : 'Mute'}
      </button>
    </div>
  )
}
