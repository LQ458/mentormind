'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { useLanguage } from '../../components/LanguageContext'
import { useBoardWebSocket } from '../../hooks/useBoardWebSocket'
import BoardCanvas from '../../components/board/BoardCanvas'
import NarrationPlayer from '../../components/board/NarrationPlayer'
import SubtitleOverlay from '../../components/board/SubtitleOverlay'
import VoiceInput from '../../components/board/VoiceInput'
import AgentActivityBar from '../../components/board/AgentActivityBar'
import SummaryPanel from '../../components/board/SummaryPanel'

export default function BoardSessionPage() {
  const params = useParams<{ sessionId: string }>()
  const sessionId = params?.sessionId as string
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { language } = useLanguage()

  const [token, setToken] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [localSummary, setLocalSummary] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [activeNarration, setActiveNarration] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(true)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchToken() {
      if (!isLoaded || !isSignedIn) return
      const t = await getToken()
      if (!cancelled) setToken(t)
    }
    void fetchToken()
    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn, getToken])

  const { state, sendAction, sendUserMessage } = useBoardWebSocket({
    sessionId,
    token,
    enabled: Boolean(token && sessionId),
  })

  const handlePauseToggle = useCallback(() => {
    const next = !paused
    setPaused(next)
    sendAction({ action: next ? 'pause' : 'resume' })
  }, [paused, sendAction])

  const handleRequestSummary = useCallback(async () => {
    if (!sessionId) return
    setSummaryLoading(true)
    try {
      const authToken = await getToken()
      const res = await fetch(`/api/backend/board/session/${sessionId}/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authToken ? `Bearer ${authToken}` : '',
        },
      })
      if (!res.ok) return
      const body = await res.json()
      const s = body?.summary ?? body
      const md =
        typeof s?.summary_markdown === 'string' && s.summary_markdown
          ? s.summary_markdown
          : typeof s === 'string'
            ? s
            : s?.error
              ? `**Error:** ${s.error}\n\n${s.fallback_summary || ''}`
              : JSON.stringify(s, null, 2)
      setLocalSummary(md)
    } finally {
      setSummaryLoading(false)
    }
  }, [sessionId, getToken])

  const handleSend = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    const ok = sendUserMessage(text)
    if (ok) setDraft('')
  }, [draft, sendUserMessage])

  const handleDraftKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter inserts a newline.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const currentSubtitle = useMemo(() => {
    if (!muted && activeNarration) return activeNarration
    return state.currentNarration
  }, [muted, activeNarration, state.currentNarration])

  const title = state.board?.title || state.board?.topic || (language === 'zh' ? 'AI 板书课' : 'AI Board Lesson')
  const topic = state.board?.topic

  const onPlaybackStart = useCallback((_elementId: string | null, text: string) => {
    setActiveNarration(text)
  }, [])
  const onPlaybackEnd = useCallback(() => {
    setActiveNarration(null)
  }, [])

  const lessonDone = state.status === 'done'

  // Keep the chat log pinned to the newest message when it grows.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [state.chatHistory.length])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-semibold truncate">{title}</h1>
          {topic && topic !== title && (
            <p className="text-xs text-slate-400 truncate">{topic}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${
            state.status === 'streaming' ? 'border-emerald-400/60 text-emerald-200 bg-emerald-500/10' :
            state.status === 'done' ? 'border-sky-400/60 text-sky-200 bg-sky-500/10' :
            state.status === 'error' ? 'border-rose-400/60 text-rose-200 bg-rose-500/10' :
            'border-slate-500/60 text-slate-300 bg-slate-700/30'
          }`}>
            {state.status}
          </span>
          <button
            type="button"
            onClick={handlePauseToggle}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700"
          >
            {paused ? (language === 'zh' ? '继续 Resume' : 'Resume') : (language === 'zh' ? '暂停 Pause' : 'Pause')}
          </button>
          <NarrationPlayer
            audioQueue={state.audioQueue}
            onPlaybackStart={onPlaybackStart}
            onPlaybackEnd={onPlaybackEnd}
            enabled={!paused}
          />
          <button
            type="button"
            onClick={() => setMuted(m => !m)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700"
          >
            {muted ? (language === 'zh' ? '启用字幕' : 'Subtitles on') : (language === 'zh' ? '仅字幕' : 'Subtitles only')}
          </button>
          <button
            type="button"
            onClick={() => setChatOpen(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700"
          >
            {chatOpen
              ? (language === 'zh' ? '隐藏对话' : 'Hide chat')
              : (language === 'zh' ? '显示对话' : 'Show chat')}
          </button>
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-sky-500/70 bg-sky-600/30 text-sky-100 hover:bg-sky-600/50"
          >
            {language === 'zh' ? '总结 Summary' : 'Summary'}
          </button>
          {lessonDone && (
            <Link
              href="/study-plan"
              className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/70 bg-emerald-600/30 text-emerald-100 hover:bg-emerald-600/50"
            >
              {language === 'zh' ? '返回学习计划' : 'Back to study plan'}
            </Link>
          )}
        </div>
      </header>

      {/* Agent activity */}
      <div className="px-4 sm:px-6 pt-3">
        <AgentActivityBar activity={state.agentActivity} />
      </div>

      {/* Canvas + chat area */}
      <main className="flex-1 min-h-0 px-4 sm:px-6 pb-4 pt-3">
        <div className="flex flex-col lg:flex-row gap-3 h-[calc(100vh-320px)] min-h-[480px]">
          <div className="relative flex-1 min-w-0">
            <BoardCanvas state={state} paused={paused} />
            <SubtitleOverlay currentNarration={currentSubtitle} />
            {state.writingStatus === 'writing' && (
              <div
                className="absolute top-3 right-3 flex items-center gap-2 bg-slate-900/80 border border-sky-400/60 text-sky-100 text-xs px-3 py-1.5 rounded-full shadow-lg"
                data-testid="writing-indicator"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-300 animate-pulse" />
                {language === 'zh' ? '正在板书…' : 'Writing on the board…'}
              </div>
            )}
            {state.error && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-rose-600/80 text-white text-xs px-3 py-1.5 rounded-lg">
                {state.error}
              </div>
            )}
          </div>
          {chatOpen && (
            <aside className="w-full lg:w-[340px] lg:shrink-0 flex flex-col border border-slate-800 bg-slate-900/60 rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                {language === 'zh' ? '与老师对话' : 'Chat with the teacher'}
              </div>
              <div
                ref={chatScrollRef}
                className="flex-1 overflow-y-auto px-3 py-3 space-y-2 text-sm"
              >
                {state.chatHistory.length === 0 ? (
                  <p className="text-slate-500 text-xs italic">
                    {language === 'zh'
                      ? '想到哪里问到哪里——语音或打字都行，AI 会在板书上回答。'
                      : 'Ask anything mid-lesson by voice or text — the AI replies on the board.'}
                  </p>
                ) : (
                  state.chatHistory.map((m, i) => (
                    <div
                      key={`${m.timestamp}-${i}`}
                      className={
                        m.role === 'user'
                          ? 'ml-6 rounded-lg bg-sky-600/20 border border-sky-500/40 px-3 py-2 text-sky-100'
                          : 'mr-6 rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-slate-200'
                      }
                    >
                      <div className="text-[10px] uppercase tracking-wide mb-0.5 opacity-60">
                        {m.role === 'user'
                          ? (language === 'zh' ? '我' : 'You')
                          : (language === 'zh' ? 'AI 老师' : 'AI Teacher')}
                      </div>
                      <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    </div>
                  ))
                )}
              </div>
            </aside>
          )}
        </div>
      </main>

      {/* Bottom controls */}
      <footer className="border-t border-slate-800 bg-slate-900/80 backdrop-blur px-4 sm:px-6 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <VoiceInput
            language={language === 'zh' ? 'zh-CN' : 'en-US'}
            onTranscript={(text, isFinal) => {
              if (isFinal) setDraft(prev => (prev ? prev + ' ' : '') + text)
            }}
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleDraftKeyDown}
            rows={1}
            placeholder={
              language === 'zh'
                ? '向 AI 老师提问…（回车发送，Shift+回车换行）'
                : 'Ask the AI teacher anything… (Enter to send, Shift+Enter for newline)'
            }
            className="flex-1 min-w-[240px] text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 resize-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || state.status === 'error'}
            className="text-xs px-4 py-2 rounded-lg border border-sky-500/70 bg-sky-600/40 text-sky-50 hover:bg-sky-600/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {language === 'zh' ? '发送' : 'Send'}
          </button>
        </div>
      </footer>

      <SummaryPanel
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        summary={localSummary ?? state.summary}
        onRequestSummary={handleRequestSummary}
        isLoading={summaryLoading}
        canRequest={lessonDone || Boolean(state.summary) || Boolean(localSummary)}
      />
    </div>
  )
}
