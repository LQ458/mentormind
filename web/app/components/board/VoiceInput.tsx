'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

interface VoiceInputProps {
  language: 'zh-CN' | 'en-US'
  onTranscript: (text: string, isFinal: boolean) => void
}

// Browser SpeechRecognition is not strongly typed yet; narrow at the edge.
interface SpeechRecognitionResult {
  readonly 0: { readonly transcript: string }
  readonly isFinal: boolean
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: ArrayLike<SpeechRecognitionResult>
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: unknown) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export default function VoiceInput({ language, onTranscript }: VoiceInputProps) {
  const [supported, setSupported] = useState(true)
  const [listening, setListening] = useState(false)
  const [preview, setPreview] = useState('')
  const recRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const Ctor = getRecognitionCtor()
    setSupported(Boolean(Ctor))
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = language
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (ev) => {
      let interim = ''
      let finalText = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interim += r[0].transcript
      }
      if (finalText) {
        onTranscript(finalText, true)
        setPreview('')
      } else {
        setPreview(interim)
        if (interim) onTranscript(interim, false)
      }
    }
    rec.onerror = () => {
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      setPreview('')
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [language, onTranscript])

  const stop = useCallback(() => {
    const rec = recRef.current
    if (rec) {
      try { rec.stop() } catch {}
    }
    setListening(false)
    setPreview('')
  }, [])

  if (!supported) {
    return (
      <button
        type="button"
        disabled
        title="Voice input not supported"
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800 text-slate-500 cursor-not-allowed"
      >
        <span aria-hidden>🎙️</span>
        <span>Voice (unsupported)</span>
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
          listening
            ? 'border-rose-400 bg-rose-500/20 text-rose-200'
            : 'border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700'
        }`}
      >
        <span aria-hidden>{listening ? '⏺' : '🎙️'}</span>
        <span>{listening ? 'Stop' : 'Voice'}</span>
      </button>
      {preview && (
        <span className="text-xs text-slate-400 max-w-xs truncate italic">
          {preview}
        </span>
      )}
    </div>
  )
}
