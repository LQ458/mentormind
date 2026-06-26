'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, Mic, MessageCircle, Plus, Send, Sparkles, Square, Users } from 'lucide-react'
import { useAuth } from '../components/AuthContext'
import { useLanguage } from '../components/LanguageContext'
import { PageHead } from '../components/design/primitives'
import { FeedbackMoment } from '../components/FeedbackMoment'

interface Participant {
  id: string
  name: string
  kind: 'human' | 'ai_facilitator' | 'ai_participant'
}

interface SeminarTurn {
  id: string
  kind: 'human' | 'ai_facilitator' | 'ai_participant'
  participant_id: string
  participant_name: string
  message: string
  question?: string
  stance?: string
  scores?: Record<string, number>
}

interface SeminarRoom {
  id: string
  title: string
  topic: string
  subject?: string
  framework?: string
  status: string
  phase: string
  max_participants: number
  participants: Participant[]
  turns: SeminarTurn[]
  match?: {
    score: number
    reasons: string[]
  }
  review?: {
    summary: string
    next_drill: string
    player_scores: Array<{
      participant_id: string
      name: string
      overall: number
      turns: number
      dimensions: Record<string, number>
    }>
  }
}

interface SuggestedTopic {
  plan_id: string
  title: string
  subject: string
  framework: string
  topic: string
}

interface SeminarProfile {
  rating: number
  rooms_completed: number
  turns_count: number
  ability_graph: Record<string, number>
}

export default function SeminarPage() {
  const { getToken, isLoaded, isSignedIn, user } = useAuth()
  const { language } = useLanguage()
  const [rooms, setRooms] = useState<SeminarRoom[]>([])
  const [recentRooms, setRecentRooms] = useState<SeminarRoom[]>([])
  const [suggestions, setSuggestions] = useState<SuggestedTopic[]>([])
  const [profile, setProfile] = useState<SeminarProfile | null>(null)
  const [activeRoom, setActiveRoom] = useState<SeminarRoom | null>(null)
  const [loading, setLoading] = useState(false)
  const [posting, setPosting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [form, setForm] = useState({
    title: language === 'zh' ? '15分钟研讨局' : '15-minute seminar',
    topic: '',
    subject: '',
    framework: '',
    plan_id: '',
  })

  const lang = language === 'zh' ? 'zh' : 'en'
  const myParticipantId = user?.id || ''

  const authHeaders = useCallback(async (json = false) => {
    const token = await getToken()
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (json) headers['Content-Type'] = 'application/json'
    return headers
  }, [getToken])

  const loadRooms = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return
    try {
      const res = await fetch('/api/backend/seminar/rooms', {
        headers: await authHeaders(),
        cache: 'no-store',
      })
      const data = await res.json()
      if (data.success) {
        setRooms(Array.isArray(data.rooms) ? data.rooms : [])
        setRecentRooms(Array.isArray(data.recent_rooms) ? data.recent_rooms : [])
        setSuggestions(Array.isArray(data.suggested_topics) ? data.suggested_topics : [])
        setProfile(data.profile || null)
      }
    } catch {
      // keep the current room on transient polling failures
    }
  }, [authHeaders, isLoaded, isSignedIn])

  const refreshActiveRoom = useCallback(async () => {
    if (!activeRoom) return
    try {
      const res = await fetch(`/api/backend/seminar/rooms/${activeRoom.id}`, {
        headers: await authHeaders(),
        cache: 'no-store',
      })
      const data = await res.json()
      if (data.success) setActiveRoom(data.room)
    } catch {
      // ignore polling hiccups
    }
  }, [activeRoom, authHeaders])

  useEffect(() => { void loadRooms() }, [loadRooms])

  useEffect(() => {
    if (!activeRoom) return
    const timer = window.setInterval(() => { void refreshActiveRoom() }, 3000)
    return () => window.clearInterval(timer)
  }, [activeRoom, refreshActiveRoom])

  useEffect(() => {
    if (!activeRoom || !isSignedIn) return
    let closed = false
    void getToken().then((token) => {
      if (closed || typeof window === 'undefined') return
      const configured = process.env.NEXT_PUBLIC_BACKEND_WS_URL
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      if (!token && (configured || isLocal)) return
      const sameOrigin = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
      const localBackend = isLocal ? 'ws://localhost:8000' : sameOrigin
      const base = configured || localBackend
      const path = `${base.replace(/\/$/, '')}/ws/seminar/${activeRoom.id}`
      const needsQueryToken = Boolean(configured || isLocal)
      const ws = new WebSocket(needsQueryToken && token ? `${path}?token=${encodeURIComponent(token)}` : path)
      wsRef.current = ws
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'room' && data.room) setActiveRoom(data.room)
        } catch {
          // ignore malformed websocket messages
        }
      }
      ws.onerror = () => {
        // Polling remains the fallback transport.
      }
    })
    return () => {
      closed = true
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close()
      }
      wsRef.current = null
    }
  }, [activeRoom?.id, getToken, isSignedIn])

  const createRoom = async () => {
    if (!form.topic.trim()) {
      setError(language === 'zh' ? '先填写研讨主题。' : 'Add a seminar topic first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/backend/seminar/rooms', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          ...form,
          language: lang,
          max_participants: 4,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.detail || data.error || 'create failed')
      setActiveRoom(data.room)
      await loadRooms()
    } catch (err) {
      console.error('Seminar room create error:', err)
      setError(language === 'zh' ? '创建研讨室失败，请重试。' : 'Could not create the seminar room. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const joinRoom = async (room: SeminarRoom) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/backend/seminar/rooms/${room.id}/join`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ display_name: user?.username || user?.firstName || 'Learner' }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.detail || data.error || 'join failed')
      setActiveRoom(data.room)
    } catch (err) {
      console.error('Seminar room join error:', err)
      setError(language === 'zh' ? '加入研讨室失败，请重试。' : 'Could not join the seminar room. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const postTurn = async () => {
    if (!activeRoom || !draft.trim()) return
    setPosting(true)
    setError('')
    try {
      const res = await fetch(`/api/backend/seminar/rooms/${activeRoom.id}/turn`, {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          participant_id: myParticipantId,
          display_name: user?.username || user?.firstName || 'Learner',
          message: draft.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.detail || data.error || 'turn failed')
      setDraft('')
      setActiveRoom(data.room)
      await loadRooms()
    } catch (err) {
      console.error('Seminar turn post error:', err)
      setError(language === 'zh' ? '发送失败，请重试。' : 'Could not send your message. Please try again.')
    } finally {
      setPosting(false)
    }
  }

  const submitAudio = async (blob: Blob) => {
    if (!activeRoom || blob.size === 0) return
    setPosting(true)
    setError('')
    try {
      const body = new FormData()
      body.append('file', blob, 'seminar-turn.webm')
      body.append('display_name', user?.username || user?.firstName || 'Learner')
      body.append('language', lang)
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`/api/backend/seminar/rooms/${activeRoom.id}/audio-turn`, {
        method: 'POST',
        headers,
        body,
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.detail || data.error || 'audio failed')
      setActiveRoom(data.room)
      await loadRooms()
    } catch (err) {
      console.error('Seminar audio turn post error:', err)
      setError(language === 'zh' ? '语音发送失败，请重试。' : 'Could not send your audio. Please try again.')
    } finally {
      setPosting(false)
    }
  }

  const toggleRecording = async () => {
    if (recording && mediaRecorder) {
      mediaRecorder.stop()
      setRecording(false)
      return
    }
    if (!activeRoom || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError(language === 'zh' ? '当前浏览器不支持录音。' : 'This browser does not support recording.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: BlobPart[] = []
      const recorderOptions = MediaRecorder.isTypeSupported?.('audio/webm') ? { mimeType: 'audio/webm' } : undefined
      const recorder = new MediaRecorder(stream, recorderOptions)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        setMediaRecorder(null)
        void submitAudio(new Blob(chunks, { type: 'audio/webm' }))
      }
      setMediaRecorder(recorder)
      setRecording(true)
      recorder.start()
    } catch (err) {
      setRecording(false)
      console.error('Seminar microphone error:', err)
      setError(language === 'zh' ? '无法开启麦克风，请检查权限后重试。' : 'Could not start the microphone. Check permissions and try again.')
    }
  }

  const finishRoom = async () => {
    if (!activeRoom) return
    setPosting(true)
    try {
      const res = await fetch(`/api/backend/seminar/rooms/${activeRoom.id}/finish`, {
        method: 'POST',
        headers: await authHeaders(),
      })
      const data = await res.json()
      if (data.success) setActiveRoom(data.room)
    } finally {
      setPosting(false)
    }
  }

  const activeHumans = useMemo(
    () => activeRoom?.participants.filter((p) => p.kind === 'human') ?? [],
    [activeRoom],
  )

  if (isLoaded && !isSignedIn) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-600">
          {language === 'zh' ? '登录后可以加入研讨房间。' : 'Sign in to join seminar rooms.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow={language === 'zh' ? '研讨模式' : 'Seminar mode'}
        title={language === 'zh' ? '多人思辨房间' : 'Collaborative debate rooms'}
        kicker={
          language === 'zh'
            ? '3-4人围绕同一学习计划研讨，Mina主持追问，Kai加入挑战。'
            : 'Small groups debate shared study topics with Mina facilitating and Kai challenging.'
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
        <div className="space-y-4">
          {profile && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 size={17} className="text-violet-600" />
                <h2 className="text-sm font-semibold text-gray-900">
                  {language === 'zh' ? '思辨档案' : 'Seminar profile'}
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-gray-50 p-2">
                  <div className="text-base font-semibold text-gray-900">{profile.rating}</div>
                  <div className="text-[11px] text-gray-500">{language === 'zh' ? '评级' : 'Rating'}</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <div className="text-base font-semibold text-gray-900">{profile.rooms_completed}</div>
                  <div className="text-[11px] text-gray-500">{language === 'zh' ? '复盘' : 'Reviews'}</div>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <div className="text-base font-semibold text-gray-900">{profile.turns_count}</div>
                  <div className="text-[11px] text-gray-500">{language === 'zh' ? '发言' : 'Turns'}</div>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {Object.entries(profile.ability_graph || {}).slice(0, 5).map(([key, value]) => (
                  <div key={key}>
                    <div className="mb-1 flex justify-between text-[11px] text-gray-500">
                      <span>{key.replace(/_/g, ' ')}</span>
                      <span>{Math.round(Number(value) * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100">
                      <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${Math.max(8, Math.round(Number(value) * 100))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Plus size={17} className="text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-900">
                {language === 'zh' ? '创建15分钟研讨局' : 'Create a 15-minute round'}
              </h2>
            </div>
            <div className="space-y-3">
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
              <textarea
                value={form.topic}
                onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))}
                placeholder={language === 'zh' ? '例如：牛顿第二定律是否只是经验规律？' : 'e.g. Is Newton’s second law only empirical?'}
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.slice(0, 4).map((item) => (
                    <button
                      key={item.plan_id}
                      type="button"
                      onClick={() => setForm((prev) => ({
                        ...prev,
                        title: item.title,
                        topic: item.topic,
                        subject: item.subject,
                        framework: item.framework,
                        plan_id: item.plan_id,
                      }))}
                      className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700"
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={createRoom}
                disabled={loading}
                className="h-10 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {language === 'zh' ? '创建房间' : 'Create room'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => joinRoom(room)}
                className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{room.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">{room.topic}</div>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                    {room.participants.filter((p) => p.kind === 'human').length}/{room.max_participants}
                  </span>
                </div>
                {room.match && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                      {language === 'zh' ? '匹配度' : 'Match'} {Math.round(room.match.score * 100)}%
                    </span>
                    {room.match.reasons.slice(0, 2).map((reason) => (
                      <span key={reason} className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] text-gray-500">
                        {reason.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>

          {recentRooms.length > 0 && (
            <div className="space-y-2">
              <div className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {language === 'zh' ? '最近参与' : 'Recent'}
              </div>
              {recentRooms.slice(0, 3).map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setActiveRoom(room)}
                  className="w-full rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-gray-300"
                >
                  <div className="text-sm font-semibold text-gray-900">{room.title}</div>
                  <div className="mt-1 text-xs text-gray-500">{room.status}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-[620px] rounded-xl border border-gray-200 bg-white shadow-sm">
          {!activeRoom ? (
            <div className="flex h-full min-h-[520px] flex-col items-center justify-center gap-3 p-8 text-center">
              <Users size={34} className="text-gray-300" />
              <p className="text-sm text-gray-500">
                {language === 'zh' ? '创建或加入一个房间开始研讨。' : 'Create or join a room to begin.'}
              </p>
            </div>
          ) : (
            <div className="flex h-full min-h-[620px] flex-col">
              <div className="border-b border-gray-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{activeRoom.title}</h2>
                    <p className="mt-1 text-sm text-gray-500">{activeRoom.topic}</p>
                  </div>
                  <button
                    type="button"
                    onClick={finishRoom}
                    disabled={posting || activeRoom.status === 'review'}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {language === 'zh' ? '结束并复盘' : 'Finish review'}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeRoom.participants.map((p) => (
                    <span
                      key={p.id}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        p.kind === 'human'
                          ? 'bg-gray-100 text-gray-700'
                          : p.kind === 'ai_facilitator'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50/60 p-4">
                {activeRoom.turns.map((turn) => (
                  <div
                    key={turn.id}
                    className={`rounded-lg border p-3 ${
                      turn.kind === 'human'
                        ? 'border-gray-200 bg-white'
                        : turn.kind === 'ai_facilitator'
                          ? 'border-blue-100 bg-blue-50'
                          : 'border-emerald-100 bg-emerald-50'
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-gray-600">
                      {turn.kind === 'ai_facilitator' && <Sparkles size={14} />}
                      {turn.kind === 'ai_participant' && <MessageCircle size={14} />}
                      <span>{turn.participant_name}</span>
                      {turn.stance && <span className="font-normal text-gray-400">· {turn.stance}</span>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-gray-900">{turn.message}</p>
                    {turn.question && (
                      <p className="mt-2 rounded-md bg-white/70 px-3 py-2 text-sm font-medium text-blue-900">
                        {turn.question}
                      </p>
                    )}
                    {turn.kind !== 'human' && (
                      <div className="mt-3">
                        <FeedbackMoment
                          surface="seminar_turn"
                          interactionId={`seminar-turn-${activeRoom.id}-${turn.id}`}
                          snapshot={{
                            room_id: activeRoom.id,
                            room_status: activeRoom.status,
                            room_phase: activeRoom.phase,
                            turn_id: turn.id,
                            participant_kind: turn.kind,
                            participant_name: turn.participant_name,
                            has_question: Boolean(turn.question),
                            has_stance: Boolean(turn.stance),
                            message_length: turn.message.length,
                            score_keys: Object.keys(turn.scores || {}),
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
                {activeRoom.review && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <h3 className="text-sm font-semibold text-amber-950">
                      {language === 'zh' ? '复盘' : 'Review'}
                    </h3>
                    <p className="mt-2 text-sm text-amber-950">{activeRoom.review.summary}</p>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeRoom.review.player_scores.map((score) => (
                        <div key={score.participant_id} className="rounded-md bg-white/80 p-3">
                          <div className="text-sm font-semibold text-gray-900">{score.name}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {language === 'zh' ? '综合得分' : 'Overall'} {Math.round(score.overall * 100)}%
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-sm font-medium text-amber-950">{activeRoom.review.next_drill}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 p-4">
                <div className="mb-2 text-xs text-gray-500">
                  {language === 'zh'
                    ? `真人席位 ${activeHumans.length}/${activeRoom.max_participants}。可以文字发言，也可以录音转写。`
                    : `Human seats ${activeHumans.length}/${activeRoom.max_participants}. Use text or record a voice turn.`}
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    placeholder={language === 'zh' ? '提出观点、反驳或总结…' : 'Make a claim, rebuttal, or synthesis…'}
                    className="min-h-[44px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                    disabled={posting || activeRoom.status === 'review'}
                  />
                  <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={posting || activeRoom.status === 'review'}
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white transition disabled:opacity-50 ${
                      recording ? 'bg-rose-600 hover:bg-rose-700' : 'bg-gray-900 hover:bg-black'
                    }`}
                    aria-label={recording ? (language === 'zh' ? '停止录音' : 'Stop recording') : (language === 'zh' ? '录音' : 'Record')}
                  >
                    {recording ? <Square size={16} /> : <Mic size={18} />}
                  </button>
                  <button
                    type="button"
                    onClick={postTurn}
                    disabled={posting || !draft.trim() || activeRoom.status === 'review'}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-50"
                    aria-label={language === 'zh' ? '发送' : 'Send'}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
