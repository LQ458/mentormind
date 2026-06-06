'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '../../components/AuthContext'
import { useLanguage } from '../../components/LanguageContext'
import { useBoardWebSocket, RECONNECT_MAX_ATTEMPTS } from '../../hooks/useBoardWebSocket'
import BoardCanvas from '../../components/board/BoardCanvas'
import NarrationPlayer from '../../components/board/NarrationPlayer'
import SubtitleOverlay from '../../components/board/SubtitleOverlay'
import VoiceInput from '../../components/board/VoiceInput'
import AgentActivityBar from '../../components/board/AgentActivityBar'
import SummaryPanel from '../../components/board/SummaryPanel'
import AuthGate from '../../components/AuthGate'
import BoardDisplaySettings, { useBoardDisplayPrefs, boardFontScaleStyle } from '../../components/board/BoardDisplaySettings'
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'
import { useFullscreen } from '../../hooks/useFullscreen'
import { track } from '../../lib/telemetry'

export default function BoardSessionPage() {
  return (
    <AuthGate>
      <BoardSessionInner />
    </AuthGate>
  )
}

function BoardSessionInner() {
  const params = useParams<{ sessionId: string }>()
  const sessionId = params?.sessionId as string
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const { language } = useLanguage()

  const [token, setToken] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [localSummary, setLocalSummary] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [activeNarration, setActiveNarration] = useState<string | null>(null)
  const [activeNarrationElementId, setActiveNarrationElementId] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(true)
  const [displayPrefs, setDisplayPrefs] = useBoardDisplayPrefs()
  const fullscreenRef = useRef<HTMLDivElement | null>(null)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(fullscreenRef)
  const [showFullscreenHint, setShowFullscreenHint] = useState(false)
  useEffect(() => {
    if (!isFullscreen) return
    setShowFullscreenHint(true)
    const t = setTimeout(() => setShowFullscreenHint(false), 2400)
    return () => clearTimeout(t)
  }, [isFullscreen])
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function tryFetch(attempt: number) {
      if (cancelled) return
      if (!isLoaded || !isSignedIn) return
      try {
        const t = await getToken()
        if (cancelled) return
        if (t) {
          setToken(t)
          setTokenError(null)
          return
        }
        // Auth can return null briefly right after sign-in; retry with backoff.
        if (attempt < 5) {
          const delay = Math.min(2000, 200 * Math.pow(2, attempt))
          timer = setTimeout(() => { void tryFetch(attempt + 1) }, delay)
        } else {
          setTokenError(
            language === 'zh'
              ? '未能获取登录凭证，请刷新页面重试。'
              : 'Could not obtain an auth token — please refresh the page.',
          )
        }
      } catch (err) {
        if (cancelled) return
        setTokenError(err instanceof Error ? err.message : 'auth token failed')
      }
    }

    void tryFetch(0)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [isLoaded, isSignedIn, getToken, language])

  const { state, sendAction, sendUserMessage, hydrate } = useBoardWebSocket({
    sessionId,
    token,
    enabled: Boolean(token && sessionId),
  })

  // Resume banner state — populated when /board/{id}/state returns a saved
  // snapshot with at least one element.
  const [resumedAt, setResumedAt] = useState<number | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const restoreAttemptedRef = useRef(false)

  // Fire a one-shot board_lesson_open event when the page first mounts with
  // a known session id.
  useEffect(() => {
    if (!sessionId) return
    track('board_lesson_open', { session_id: sessionId })
  }, [sessionId])

  // Fetch any persisted state before the WS opens — gives the user immediate
  // visual continuity on refresh / re-entry. The WS itself will pick up where
  // the in-memory backend session left off (or start fresh if it's gone).
  useEffect(() => {
    if (!sessionId || !token) return
    if (restoreAttemptedRef.current) return
    restoreAttemptedRef.current = true
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/backend/board/${sessionId}/state`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (cancelled) return
        if (res.status === 404) return
        if (!res.ok) return
        const body = await res.json().catch(() => null)
        const snap = (body?.session ?? body?.state) as Record<string, unknown> | undefined
        if (cancelled || !body || !body.success || !snap) return
        const elements = (snap.elements as Record<string, unknown> | undefined) ?? {}
        if (Object.keys(elements).length === 0) return
        hydrate(snap)
        const updatedAt = snap.updated_at
        const resumedTime =
          typeof updatedAt === 'number'
            ? updatedAt
            : typeof updatedAt === 'string'
              ? Date.parse(updatedAt)
              : Date.now()
        setResumedAt(Number.isFinite(resumedTime) ? resumedTime : Date.now())
      } catch {
        // network errors are non-fatal; just proceed without resume banner.
      }
    })()
    return () => { cancelled = true }
  }, [sessionId, token, hydrate])

  const handleDiscardResume = useCallback(() => {
    setBannerDismissed(true)
    setResumedAt(null)
    // Best-effort: ask backend to drop the saved snapshot if such an endpoint
    // exists. We don't await — failure just means the next refresh will still
    // see the snapshot, which the user can dismiss again.
    if (token && sessionId) {
      try {
        void fetch(`/api/backend/board/${sessionId}/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ state: { elements: {}, element_order: [] }, status: 'idle' }),
          keepalive: true,
        }).catch(() => {})
      } catch {
        // swallow
      }
    }
  }, [sessionId, token])

  const handlePauseToggle = useCallback(() => {
    const next = !paused
    setPaused(next)
    sendAction({ action: next ? 'pause' : 'resume' })
  }, [paused, sendAction])

  useKeyboardShortcut(
    { key: ' ', ignoreInputs: true },
    handlePauseToggle
  )
  useKeyboardShortcut(
    { key: 'f', ignoreInputs: true },
    () => toggleFullscreen()
  )

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

  const handleCreateShareLink = useCallback(async () => {
    if (!sessionId) return
    setShareStatus(language === 'zh' ? '正在创建链接…' : 'Creating link…')
    try {
      const authToken = await getToken()
      const res = await fetch(`/api/backend/board/session/${sessionId}/share`, {
        method: 'POST',
        headers: {
          Authorization: authToken ? `Bearer ${authToken}` : '',
        },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.share_url) {
        setShareStatus(language === 'zh' ? '创建失败' : 'Could not create link')
        return
      }
      const url = body.share_url as string
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setShareStatus(language === 'zh' ? '分享链接已复制' : 'Share link copied')
      } else {
        setShareStatus(url)
      }
    } catch (err) {
      setShareStatus(err instanceof Error ? err.message : (language === 'zh' ? '创建失败' : 'Could not create link'))
    }
  }, [sessionId, getToken, language])

  const canAskTeacher = state.status !== 'error' && Boolean(state.board || state.elementOrder.length > 0)

  const handleSend = useCallback(() => {
    const text = draft.trim()
    if (!text) return
    if (!canAskTeacher) return
    const ok = sendUserMessage(text)
    if (ok) setDraft('')
  }, [canAskTeacher, draft, sendUserMessage])

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

  const onPlaybackStart = useCallback((elementId: string | null, text: string) => {
    setActiveNarration(text)
    setActiveNarrationElementId(elementId)
  }, [])
  const onPlaybackEnd = useCallback((elementId: string | null) => {
    setActiveNarration(null)
    setActiveNarrationElementId(prev => (prev === elementId ? null : prev))
  }, [])

  const lessonDone = state.status === 'done'

  // Keep the chat log pinned to the newest message when it grows.
  // Must run on every render (above any conditional return) to satisfy rules of hooks.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [state.chatHistory.length])

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 gap-3 px-6">
        {tokenError ? (
          <>
            <p className="text-sm text-rose-300">{tokenError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700"
            >
              {language === 'zh' ? '刷新重试' : 'Refresh'}
            </button>
          </>
        ) : (
          <>
            <div
              className="h-8 w-8 rounded-full border-2 border-slate-700 border-t-sky-400 animate-spin"
              aria-hidden
            />
            <p className="text-sm text-slate-300">
              {language === 'zh' ? '正在连接课堂…' : 'Connecting to your lesson…'}
            </p>
            <p className="text-xs text-slate-500">
              {language === 'zh'
                ? '等待登录凭证完成初始化，稍候几秒即可。'
                : 'Waiting for your session token — this only takes a moment.'}
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top bar */}
      <header className="space-y-3 px-3 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/85 backdrop-blur">
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold truncate">{title}</h1>
          {topic && topic !== title && (
            <p className="text-xs text-slate-400 truncate">{topic}</p>
          )}
        </div>
        <div className="-mx-3 sm:mx-0 overflow-x-auto px-3 sm:px-0 pb-1">
          <div className="flex min-w-max items-center gap-2">
            <span className={`h-9 inline-flex items-center whitespace-nowrap text-xs px-3 rounded-full border ${
              paused ? 'border-amber-400/60 text-amber-200 bg-amber-500/10' :
              state.status === 'streaming' ? 'border-emerald-400/60 text-emerald-200 bg-emerald-500/10' :
              state.status === 'done' ? 'border-sky-400/60 text-sky-200 bg-sky-500/10' :
              state.status === 'error' ? 'border-rose-400/60 text-rose-200 bg-rose-500/10' :
              state.status === 'reconnecting' ? 'border-amber-400/60 text-amber-200 bg-amber-500/10' :
              state.status === 'open' ? 'border-sky-400/60 text-sky-200 bg-sky-500/10' :
              'border-slate-500/60 text-slate-300 bg-slate-700/30'
            }`}>
              {paused
                ? (language === 'zh' ? '已暂停' : 'paused')
                : state.status === 'connecting' ? (language === 'zh' ? '连接中…' : 'connecting…')
                : state.status === 'reconnecting' ? (language === 'zh'
                    ? `重连中 ${state.reconnectAttempt}/${RECONNECT_MAX_ATTEMPTS}…`
                    : `reconnecting ${state.reconnectAttempt}/${RECONNECT_MAX_ATTEMPTS}…`)
                : state.status === 'open' ? (language === 'zh' ? '等待开讲…' : 'waiting for lesson…')
                : state.status === 'streaming' ? (language === 'zh' ? '讲课中' : 'streaming')
                : state.status === 'done' ? (language === 'zh' ? '已结束' : 'done')
                : state.status === 'error' ? (language === 'zh' ? '出错了' : 'error')
                : state.status}
            </span>
            <button
              type="button"
              onClick={handlePauseToggle}
              className="h-9 inline-flex items-center whitespace-nowrap text-xs px-3 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700"
            >
              {paused
                ? (language === 'zh' ? '继续讲课' : 'Resume lesson')
                : (language === 'zh' ? '暂停讲课' : 'Pause lesson')}
            </button>
            <BoardDisplaySettings
              prefs={displayPrefs}
              onChange={setDisplayPrefs}
              language={language === 'zh' ? 'zh' : 'en'}
            />
            <button
              type="button"
              onClick={toggleFullscreen}
              className="h-9 inline-flex items-center whitespace-nowrap text-xs px-3 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700 gap-1"
              aria-label={isFullscreen
                ? (language === 'zh' ? '退出全屏' : 'Exit fullscreen')
                : (language === 'zh' ? '进入全屏' : 'Enter fullscreen')}
              title={`${language === 'zh' ? '快捷键' : 'Shortcut'}: F`}
            >
              <span aria-hidden>{isFullscreen ? '⤢' : '⛶'}</span>
              {isFullscreen
                ? (language === 'zh' ? '退出全屏' : 'Exit')
                : (language === 'zh' ? '全屏' : 'Fullscreen')}
            </button>
            <NarrationPlayer
              audioQueue={state.audioQueue}
              onPlaybackStart={onPlaybackStart}
              onPlaybackEnd={onPlaybackEnd}
              enabled={!paused}
              language={language}
              narrationLog={state.narrationLog}
              audioByElementId={state.audioByElementId}
              fallbackEnabled={
                process.env.NEXT_PUBLIC_BOARD_FAST_MODE === 'true' ||
                process.env.NEXT_PUBLIC_BOARD_FAST_MODE === '1'
              }
            />
            <button
              type="button"
              onClick={() => setMuted(m => !m)}
              className="h-9 inline-flex items-center whitespace-nowrap text-xs px-3 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700"
            >
              {muted ? (language === 'zh' ? '启用字幕' : 'Subtitles on') : (language === 'zh' ? '仅字幕' : 'Subtitles only')}
            </button>
            <button
              type="button"
              onClick={() => setChatOpen(v => !v)}
              className="h-9 inline-flex items-center whitespace-nowrap text-xs px-3 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700"
            >
              {chatOpen
                ? (language === 'zh' ? '隐藏对话' : 'Hide chat')
                : (language === 'zh' ? '显示对话' : 'Show chat')}
            </button>
            <button
              type="button"
              onClick={() => setSummaryOpen(true)}
              className="h-9 inline-flex items-center whitespace-nowrap text-xs px-3 rounded-lg border border-sky-500/70 bg-sky-600/30 text-sky-100 hover:bg-sky-600/50"
            >
              {language === 'zh' ? '总结' : 'Summary'}
            </button>
            <button
              type="button"
              onClick={handleCreateShareLink}
              className="h-9 inline-flex items-center whitespace-nowrap text-xs px-3 rounded-lg border border-violet-500/70 bg-violet-600/30 text-violet-100 hover:bg-violet-600/50"
              title={shareStatus || undefined}
            >
              {language === 'zh' ? '分享' : 'Share'}
            </button>
            {lessonDone && (
              <Link
                href="/study-plan"
                className="h-9 inline-flex items-center whitespace-nowrap text-xs px-3 rounded-lg border border-emerald-500/70 bg-emerald-600/30 text-emerald-100 hover:bg-emerald-600/50"
              >
                {language === 'zh' ? '返回学习计划' : 'Back to study plan'}
              </Link>
            )}
          </div>
        </div>
      </header>

      {shareStatus && (
        <div className="px-4 sm:px-6 pt-3">
          <div className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">
            {shareStatus}
          </div>
        </div>
      )}

      {/* Resume banner — shown when we hydrated from a saved snapshot */}
      {resumedAt && !bannerDismissed && (
        <div className="px-4 sm:px-6 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-sky-500/40 bg-sky-500/10 text-xs text-sky-100">
            <span>
              {language === 'zh'
                ? `已从 ${new Date(resumedAt).toLocaleString('zh-CN')} 的进度恢复`
                : `Resumed from ${new Date(resumedAt).toLocaleString()}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscardResume}
                className="px-2.5 py-1 rounded-md border border-sky-400/50 bg-sky-600/20 hover:bg-sky-600/40 text-sky-50"
              >
                {language === 'zh' ? '丢弃并重新开始' : 'Discard & restart'}
              </button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="px-2 py-1 rounded-md text-sky-200 hover:text-sky-50"
                aria-label={language === 'zh' ? '关闭' : 'Dismiss'}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent activity */}
      <div className="px-4 sm:px-6 pt-3">
        <AgentActivityBar activity={state.agentActivity} />
      </div>

      {/* Canvas + chat area */}
      <main className="flex-1 min-h-0 px-3 sm:px-6 pb-4 pt-3">
        <div className="flex flex-col lg:flex-row gap-3 h-[calc(100dvh-260px)] sm:h-[calc(100dvh-230px)] lg:h-[calc(100dvh-320px)] min-h-[420px]">
          <div
            ref={fullscreenRef}
            className={`relative flex-1 min-w-0 ${displayPrefs.highContrast ? 'board-high-contrast' : ''} ${isFullscreen ? 'bg-slate-950 p-4' : ''}`}
            style={boardFontScaleStyle(displayPrefs)}
          >
            <BoardCanvas state={state} paused={paused} activeElementId={activeNarrationElementId} />
            {showFullscreenHint && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-900/85 border border-slate-600 text-sm text-slate-100 shadow-lg z-50 pointer-events-none">
                {language === 'zh' ? '按 Esc 退出全屏' : 'Press Esc to exit fullscreen'}
              </div>
            )}
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
              <div className="absolute top-3 left-1/2 -translate-x-1/2 max-w-[calc(100%-1rem)] bg-rose-600/85 text-white text-xs px-3 py-2 rounded-lg break-words">
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
        <div className="flex flex-wrap items-start gap-2 sm:gap-3">
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
              !canAskTeacher
                ? (language === 'zh' ? 'Mina 正在准备板书…' : 'Mina is preparing the board…')
                : language === 'zh'
                  ? '向 AI 老师提问…（回车发送，Shift+回车换行）'
                  : 'Ask the AI teacher anything… (Enter to send, Shift+Enter for newline)'
            }
            className="flex-1 min-w-[180px] text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 resize-none"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || !canAskTeacher}
            className="whitespace-nowrap text-xs px-3 sm:px-4 py-2 rounded-lg border border-sky-500/70 bg-sky-600/40 text-sky-50 hover:bg-sky-600/60 disabled:opacity-40 disabled:cursor-not-allowed"
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
