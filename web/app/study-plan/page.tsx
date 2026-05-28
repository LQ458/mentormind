'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import DOMPurify from 'dompurify'
import { Mic, ImagePlus, X } from 'lucide-react'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '../components/AuthContext'
import { PageHead, Section } from '../components/design/primitives'
import KnowledgeGraph from '../components/design/KnowledgeGraph'
import { SUBJECTS } from '../lib/subjects'
import { FRAMEWORKS, getFramework } from '../lib/frameworks'
import { getCourseSuggestions } from '../lib/course-suggestions'
import { track } from '../lib/telemetry'
import { useIngestUpload, type MediaContext } from '../hooks/useIngestUpload'

// DOMPurify only runs in the browser. On the server (during SSR/prerender) we
// fall back to passing the input through unchanged because the eventual render
// happens client-side and will be sanitized there.
const sanitizeHtml = (html: string): string =>
  typeof window === 'undefined' ? html : DOMPurify.sanitize(html)

// ── Types ────────────────────────────────────────────────────────────────────

type WorkflowPhase = 'selecting' | 'chatting' | 'plan_review' | 'creating' | 'done'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  // v2 smart-interaction fields: when the backend emits an ask_user block,
  // we surface clickable option chips alongside the chat bubble.
  options?: string[]
  allowFreeText?: boolean
}

interface StudyUnit {
  title: string
  topics: string[]
  estimated_hours: number
}

interface ProposedPlan {
  title: string
  subject: string
  framework: string
  estimated_hours: number
  units: StudyUnit[]
}

async function readJsonOrThrow(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  let data: any = null

  if (contentType.includes('application/json') && text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const rawDetail = data?.detail
    const detail =
      (typeof rawDetail === 'object' && rawDetail?.error) ||
      (typeof rawDetail === 'string' && rawDetail) ||
      data?.error ||
      (response.status === 504
        ? 'Study-plan chat timed out. Please retry or type "generate".'
        : text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180))

    throw new Error(typeof detail === 'string' && detail ? detail : `Request failed (${response.status})`)
  }

  if (data === null) {
    throw new Error('Server returned a non-JSON response. Please retry.')
  }

  return data
}

function makeStudyPlanRequestId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

// ── Message renderer (matches /create pattern) ───────────────────────────────

function AssistantMessage({ content }: { content: string }) {
  const renderInline = (text: string, key: string | number) => {
    const bold = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    const italic = bold
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
    const code = italic.replace(
      /`([^`]+)`/g,
      '<code class="bg-gray-200 rounded px-1 py-0.5 text-xs font-mono">$1</code>'
    )
    return <span key={key} dangerouslySetInnerHTML={{ __html: sanitizeHtml(code) }} />
  }

  return (
    <div className="text-sm leading-relaxed space-y-1">
      {content.split('\n').map((line, li) => (
        <p key={li} className={line.trim() === '' ? 'h-2' : ''}>
          {renderInline(line, li)}
        </p>
      ))}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function StudyPlanPage() {
  const router = useRouter()
  const { language: uiLanguage } = useLanguage()
  const { getToken } = useAuth()

  const audioInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const lang = uiLanguage === 'zh' ? 'zh' as const : 'en' as const
  const {
    contexts,
    isUploading,
    handleAudioUpload,
    handleImageUpload,
    removeContext,
    buildContextMessage,
    clearContexts,
  } = useIngestUpload(lang)

  const [phase, setPhase] = useState<WorkflowPhase>('selecting')
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [chatStage, setChatStage] = useState('opening')
  const [streamingContent, setStreamingContent] = useState<string | null>(null)

  const [proposedPlan, setProposedPlan] = useState<ProposedPlan | null>(null)
  const [planFeedback, setPlanFeedback] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Gaokao now flows through the same chat path as every other framework.
  // Standalone Gaokao tutoring lives at /gaokao (kept for bookmark continuity).

  const chatEndRef = useRef<HTMLDivElement>(null)

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  // Existing plans
  const [myPlans, setMyPlans] = useState<{
    id: string; title: string; subject: string; framework: string;
    progress_percentage: number; status: string; total_units: number;
    created_at: string | null; updated_at: string | null;
  }[]>([])
  const [plansLoading, setPlansLoading] = useState(true)

  // Fetch existing study plans
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const token = await getToken()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers.Authorization = `Bearer ${token}`

        const res = await fetch('/api/backend/study-plan/my-plans', { headers })
        const data = await res.json()
        if (data.success && data.plans) {
          setMyPlans(data.plans)
        }
      } catch {
        // silently ignore
      } finally {
        setPlansLoading(false)
      }
    }
    fetchPlans()
  }, [getToken, createdPlanId])

  // Auto-scroll on new messages or streaming updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingContent])

  // Warn before leaving if there's unsaved work
  useEffect(() => {
    const hasUnsavedWork =
      (phase === 'chatting' && chatMessages.length > 1) ||
      (phase === 'plan_review' && proposedPlan !== null)

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedWork) {
        e.preventDefault()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [phase, chatMessages.length, proposedPlan])

  // ── Subject/Framework Selection ──────────────────────────────────────────

  const handleSubjectSelect = (subjectId: string) => {
    setSelectedSubject(subjectId)
  }

  const handleFrameworkSelect = (frameworkId: string) => {
    setSelectedFramework(frameworkId)
    const subject = SUBJECTS.find((s) => s.id === selectedSubject)

    // Unified flow: every framework (including Gaokao) runs the same plan-creation chat.
    const framework = FRAMEWORKS.find((f) => f.id === frameworkId)
    const openingMessage: ChatMessage = {
      id: 'opening_1',
      role: 'assistant',
      content:
        uiLanguage === 'zh'
          ? `你好！我来帮你制定一份 ${subject?.labelZh ?? ''} ${framework?.labelZh ?? ''} 的学习计划。先告诉我你目前的基础水平，以及你的目标或考试时间线吧！`
          : `Hi! I'll help you build a ${subject?.label ?? ''} ${framework?.label ?? ''} study plan. Tell me about your current level and your goals or exam timeline!`,
      timestamp: new Date(),
    }
    setChatMessages([openingMessage])
    setPhase('chatting')
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  const handleSendMessage = async () => {
    if (!userInput.trim()) return

    const contextMsg = buildContextMessage()
    const fullContent = contextMsg ? `${contextMsg}\n\n---\n${userInput}` : userInput

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: fullContent,
      timestamp: new Date(),
    }

    setChatMessages((prev) => [...prev, userMessage])
    const currentInput = userInput
    setUserInput('')
    setIsTyping(true)
    setError(null)

    if (contextMsg) clearContexts()

    const chatStartedAt = Date.now()
    const requestId = makeStudyPlanRequestId()
    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      console.info('[study-plan/chat] send', {
        requestId,
        mode: 'typed',
        stage: chatStage,
        subject: selectedSubject,
        framework: selectedFramework,
      })
      const response = await fetch('/api/backend/study-plan/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          history: [...chatMessages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stage: chatStage,
          request_id: requestId,
          subject: selectedSubject,
          framework: selectedFramework,
          language: uiLanguage === 'zh' ? 'zh' : 'en',
        }),
      })

      const data = await readJsonOrThrow(response)
      console.info('[study-plan/chat] response', {
        requestId,
        mode: 'typed',
        stage: data?.stage ?? chatStage,
        source: data?.response_source ?? 'unknown',
        hasPlan: Boolean(data?.proposed_plan),
      })
      try {
        track(
          'study_plan_chat_rtt',
          {
            phase: typeof data?.stage === 'string' ? data.stage : chatStage,
            source: data?.response_source ?? 'unknown',
            mode: 'typed',
          },
          { latency_ms: Date.now() - chatStartedAt },
        )
      } catch {
        // swallow
      }

      if (data.success || data.content) {
        if (data.stage) setChatStage(data.stage)

        // Stream the response word by word (matches /create pattern)
        const words = ((data.content ?? '') as string).split(' ')
        setStreamingContent('')
        let built = ''
        for (let i = 0; i < words.length; i++) {
          built += (i === 0 ? '' : ' ') + words[i]
          setStreamingContent(built)
          await new Promise((r) => setTimeout(r, 28))
        }
        setStreamingContent(null)

        const aiResponse: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.content ?? '',
          timestamp: new Date(),
          options: Array.isArray(data.options) && data.options.length > 0 ? data.options : undefined,
          allowFreeText: data.allow_free_text !== false,
        }
        setChatMessages((prev) => [...prev, aiResponse])

        // Transition to plan review when backend returns a proposed plan
        if (data.proposed_plan) {
          setProposedPlan(data.proposed_plan)
          setPhase('plan_review')
        }
      } else {
        setError(
          uiLanguage === 'zh'
            ? '获取回复失败，请重试。'
            : 'Failed to get a response. Please try again.'
        )
      }
    } catch (err) {
      console.error('Study plan chat error:', err)
      const fallback =
        uiLanguage === 'zh'
          ? '网络错误，请检查连接后重试。'
          : 'Network error. Please check your connection and try again.'
      setError(
        err instanceof Error && err.message ? err.message : fallback
      )
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // ── Quick-reply chip click → send the chip text as user message ─────────
  const handleChipClick = (option: string) => {
    if (isTyping) return
    setUserInput(option)
    // Defer so React updates the textarea value before send
    setTimeout(() => {
      setUserInput('')
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: option,
        timestamp: new Date(),
      }
      setChatMessages((prev) => [...prev, userMessage])
      // Mirror handleSendMessage but use the option directly
      void (async () => {
        setIsTyping(true)
        setError(null)
        const chipStartedAt = Date.now()
        const requestId = makeStudyPlanRequestId()
        try {
          const token = await getToken()
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (token) headers.Authorization = `Bearer ${token}`
          console.info('[study-plan/chat] send', {
            requestId,
            mode: 'chip',
            stage: chatStage,
            subject: selectedSubject,
            framework: selectedFramework,
            option,
          })
          const response = await fetch('/api/backend/study-plan/chat', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              history: [...chatMessages, userMessage].map((m) => ({ role: m.role, content: m.content })),
              stage: chatStage,
              request_id: requestId,
              subject: selectedSubject,
              framework: selectedFramework,
              language: uiLanguage === 'zh' ? 'zh' : 'en',
            }),
          })
          const data = await readJsonOrThrow(response)
          console.info('[study-plan/chat] response', {
            requestId,
            mode: 'chip',
            stage: data?.stage ?? chatStage,
            source: data?.response_source ?? 'unknown',
            hasPlan: Boolean(data?.proposed_plan),
          })
          try {
            track(
              'study_plan_chat_rtt',
              {
                phase: typeof data?.stage === 'string' ? data.stage : chatStage,
                source: data?.response_source ?? 'unknown',
                mode: 'chip',
              },
              { latency_ms: Date.now() - chipStartedAt },
            )
          } catch {
            // swallow
          }
          if (data.success || data.content) {
            if (data.stage) setChatStage(data.stage)
            const aiResponse: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: data.content ?? '',
              timestamp: new Date(),
              options: Array.isArray(data.options) && data.options.length > 0 ? data.options : undefined,
              allowFreeText: data.allow_free_text !== false,
            }
            setChatMessages((prev) => [...prev, aiResponse])
            if (data.proposed_plan) {
              setProposedPlan(data.proposed_plan)
              setPhase('plan_review')
            }
          }
        } catch (err) {
          console.error('Chip click chat error:', err)
          const fallback =
            uiLanguage === 'zh'
              ? '网络错误，请检查连接后重试。'
              : 'Network error. Please check your connection and try again.'
          setError(err instanceof Error && err.message ? err.message : fallback)
        } finally {
          setIsTyping(false)
        }
      })()
    }, 0)
  }

  // ── Auto-save plan when generated ─────────────────────────────────────────

  const autoSavePlan = useCallback(async (plan: ProposedPlan) => {
    setAutoSaveStatus('saving')
    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await fetch('/api/backend/study-plan/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          plan_data: {
            ...plan,
            subject: selectedSubject,
            framework: selectedFramework,
          },
          language: uiLanguage === 'zh' ? 'zh' : 'en',
        }),
      })

      const data = await response.json()

      if (data.success && data.plan_id) {
        setCreatedPlanId(data.plan_id)
        setAutoSaveStatus('saved')
      } else if (data.plan_id) {
        setCreatedPlanId(data.plan_id)
        setAutoSaveStatus('saved')
      } else {
        setAutoSaveStatus('idle')
      }
    } catch {
      setAutoSaveStatus('idle')
    }
  }, [getToken, selectedSubject, selectedFramework, uiLanguage])

  // Trigger auto-save when a proposed plan is received
  useEffect(() => {
    if (proposedPlan && phase === 'plan_review' && !createdPlanId) {
      autoSavePlan(proposedPlan)
    }
  }, [proposedPlan, phase, createdPlanId, autoSavePlan])

  // ── Plan review ───────────────────────────────────────────────────────────

  const handleRequestChanges = () => {
    const feedbackMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content:
        planFeedback.trim() ||
        (uiLanguage === 'zh' ? '我想调整一下计划。' : 'I would like to make some changes.'),
      timestamp: new Date(),
    }
    setChatMessages((prev) => [...prev, feedbackMessage])
    setPlanFeedback('')
    setProposedPlan(null)
    setCreatedPlanId(null)
    setAutoSaveStatus('idle')
    setPhase('chatting')
    // handleSendMessage will handle the next turn
    setUserInput(feedbackMessage.content)
  }

  const handleConfirmPlan = async () => {
    if (!proposedPlan) return

    // If auto-save already created the plan, just navigate
    if (createdPlanId) {
      setPhase('done')
      router.push(`/study-plan/${createdPlanId}`)
      return
    }

    setIsCreating(true)
    setPhase('creating')
    setError(null)

    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await fetch('/api/backend/study-plan/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          plan_data: {
            ...proposedPlan,
            subject: selectedSubject,
            framework: selectedFramework,
          },
          language: uiLanguage === 'zh' ? 'zh' : 'en',
        }),
      })

      const data = await response.json()

      if (data.success && data.plan_id) {
        setCreatedPlanId(data.plan_id)
        setPhase('done')
        router.push(`/study-plan/${data.plan_id}`)
      } else if (data.plan_id) {
        setCreatedPlanId(data.plan_id)
        setPhase('done')
        router.push(`/study-plan/${data.plan_id}`)
      } else {
        setError(
          uiLanguage === 'zh'
            ? '计划创建失败，请重试。'
            : 'Failed to create plan. Please try again.'
        )
        setPhase('plan_review')
      }
    } catch (err) {
      console.error('Study plan create error:', err)
      setError(
        uiLanguage === 'zh'
          ? '网络错误，计划保存失败。'
          : 'Network error. Failed to save plan.'
      )
      setPhase('plan_review')
    } finally {
      setIsCreating(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const latestOptionMessageId = [...chatMessages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.options && message.options.length > 0)?.id

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow={uiLanguage === 'zh' ? '学习计划' : 'Study plan'}
        title={uiLanguage === 'zh' ? '你的学习计划' : 'Your study plan'}
        kicker={
          uiLanguage === 'zh'
            ? '查看已有计划，或与 AI 对话创建新的学习计划。'
            : 'View your existing plans or chat with AI to build a new one.'
        }
      />

      <Section title={uiLanguage === 'zh' ? '知识图' : 'Knowledge graph'}>
        <div className="card-new" style={{ padding: 18 }}>
          <KnowledgeGraph />
        </div>
      </Section>

      {/* ── MY STUDY PLANS ────────────────────────────────────────────────── */}
      {myPlans.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {uiLanguage === 'zh' ? '我的学习计划' : 'My Study Plans'}
            </h2>
            <span className="text-sm text-gray-500">
              {myPlans.length} {uiLanguage === 'zh' ? '个计划' : myPlans.length === 1 ? 'plan' : 'plans'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {myPlans.map((p) => {
              const subjectObj = SUBJECTS.find(s => s.id === p.subject)
              const frameworkObj = FRAMEWORKS.find(f => f.id === p.framework)
              return (
                <button
                  key={p.id}
                  onClick={() => router.push(`/study-plan/${p.id}`)}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 text-left hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl">{subjectObj?.icon ?? '📚'}</span>
                      <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                        {p.title}
                      </h3>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      p.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : p.status === 'active'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {p.status === 'completed'
                        ? uiLanguage === 'zh' ? '已完成' : 'Completed'
                        : p.status === 'active'
                        ? uiLanguage === 'zh' ? '进行中' : 'Active'
                        : p.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    <span>{uiLanguage === 'zh' ? subjectObj?.labelZh : subjectObj?.label}</span>
                    <span>·</span>
                    <span>{uiLanguage === 'zh' ? frameworkObj?.labelZh : frameworkObj?.label}</span>
                    <span>·</span>
                    <span>{p.total_units} {uiLanguage === 'zh' ? '单元' : 'units'}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{uiLanguage === 'zh' ? '进度' : 'Progress'}</span>
                      <span className="font-medium text-gray-700">{Math.round(p.progress_percentage)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${p.progress_percentage}%` }}
                      />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {plansLoading && myPlans.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
              <div className="h-1.5 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* ── CREATE NEW PLAN ───────────────────────────────────────────────── */}
      {myPlans.length > 0 && phase === 'selecting' && (
        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            {uiLanguage === 'zh' ? '创建新计划' : 'Create New Plan'}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {uiLanguage === 'zh'
              ? '选择科目和框架，与 AI 对话制定专属学习计划。'
              : 'Choose a subject and framework, then chat with AI to build your personalized plan.'}
          </p>
        </div>
      )}

      {/* Phase indicator (unified for every framework, including Gaokao) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { key: 'selecting', label: uiLanguage === 'zh' ? '1. 选择科目' : '1. Select' },
          { key: 'chatting', label: uiLanguage === 'zh' ? '2. 对话诊断' : '2. Chat' },
          { key: 'plan_review', label: uiLanguage === 'zh' ? '3. 确认计划' : '3. Review' },
          { key: 'creating', label: uiLanguage === 'zh' ? '4. 生成计划' : '4. Create' },
        ].map((step) => (
          <div
            key={step.key}
            className={`rounded-xl border px-3 py-2 text-sm font-medium text-center ${
              phase === step.key ||
              (step.key === 'creating' && phase === 'done') ||
              (step.key === 'done' && phase === 'done')
                ? 'border-blue-300 bg-blue-50 text-blue-900'
                : 'border-gray-200 bg-white text-gray-500'
            }`}
          >
            {step.label}
          </div>
        ))}
      </div>

      {/* ── SELECTING PHASE ─────────────────────────────────────────────────── */}
      {phase === 'selecting' && (
        <div className="space-y-8">
          {/* Framework picker — always visible. Each card has its own icon + accent
              so Gaokao / IB / A-Level read as distinct modules from the start. */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {uiLanguage === 'zh' ? '选择考试框架' : 'Choose an Exam Framework'}
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              {uiLanguage === 'zh'
                ? '每个框架都有独立的考纲与单元结构。'
                : 'Each framework brings its own syllabus and unit structure.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {FRAMEWORKS.map((framework) => {
                const isActive = selectedFramework === framework.id
                // Count is total across all subjects when no subject picked yet
                const totalCourses = selectedSubject
                  ? getCourseSuggestions(framework.id, selectedSubject).length
                  : Object.values(
                      ({} as Record<string, never>),
                    ).length // placeholder, see below
                const subjectsCovered = (() => {
                  // Number of subjects this framework has at least 1 course for
                  // (helps users understand the scope of each module).
                  let n = 0
                  for (const s of SUBJECTS) {
                    if (getCourseSuggestions(framework.id, s.id).length > 0) n++
                  }
                  return n
                })()
                return (
                  <button
                    key={framework.id}
                    onClick={() => setSelectedFramework(framework.id)}
                    className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all hover:shadow-sm ${
                      isActive
                        ? `${framework.borderClass} ${framework.bgClass} shadow-sm`
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div
                      className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                        isActive ? framework.bgClass : 'bg-gray-100'
                      }`}
                      aria-hidden
                    >
                      {framework.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${isActive ? framework.textClass : 'text-gray-900'}`}>
                          {uiLanguage === 'zh' ? framework.labelZh : framework.label}
                        </span>
                        {selectedSubject && totalCourses > 0 && (
                          <span className="text-[10px] uppercase tracking-wide bg-white text-gray-600 rounded-full px-2 py-0.5 border border-gray-200">
                            {totalCourses} {uiLanguage === 'zh' ? '门课' : totalCourses === 1 ? 'course' : 'courses'}
                          </span>
                        )}
                        {!selectedSubject && subjectsCovered > 0 && (
                          <span className="text-[10px] uppercase tracking-wide bg-white text-gray-600 rounded-full px-2 py-0.5 border border-gray-200">
                            {subjectsCovered} {uiLanguage === 'zh' ? '科目' : subjectsCovered === 1 ? 'subject' : 'subjects'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 leading-snug">
                        {uiLanguage === 'zh' ? framework.taglineZh : framework.taglineEn}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Subject grid — supported subjects highlighted once framework is picked. */}
          {selectedFramework && (
            <div className="animate-in fade-in duration-300">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                {uiLanguage === 'zh' ? '选择科目' : 'Choose a Subject'}
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                {uiLanguage === 'zh'
                  ? `加亮的科目在 ${getFramework(selectedFramework)?.labelZh ?? ''} 框架下有官方课程，其他科目可走通用规划。`
                  : `Highlighted subjects have official courses under ${getFramework(selectedFramework)?.label ?? ''}; the rest fall back to general planning.`}
              </p>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                {uiLanguage === 'zh' ? '理工科' : 'STEM'}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-4">
                {SUBJECTS.filter((s) => s.category === 'stem').map((subject) => {
                  const supported = getCourseSuggestions(selectedFramework, subject.id).length > 0
                  const isActive = selectedSubject === subject.id
                  return (
                    <button
                      key={subject.id}
                      onClick={() => handleSubjectSelect(subject.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:shadow-sm ${
                        isActive
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : supported
                            ? 'border-gray-200 bg-white hover:border-blue-400'
                            : 'border-gray-100 bg-gray-50 opacity-60 hover:opacity-90'
                      }`}
                    >
                      <span className="text-2xl">{subject.icon}</span>
                      <span className="text-xs font-medium text-gray-800 text-center leading-tight">
                        {uiLanguage === 'zh' ? subject.labelZh : subject.label}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                {uiLanguage === 'zh' ? '人文社科' : 'Humanities & Social Sciences'}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
                {SUBJECTS.filter((s) => s.category === 'humanities').map((subject) => {
                  const supported = getCourseSuggestions(selectedFramework, subject.id).length > 0
                  const isActive = selectedSubject === subject.id
                  return (
                    <button
                      key={subject.id}
                      onClick={() => handleSubjectSelect(subject.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:shadow-sm ${
                        isActive
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : supported
                            ? 'border-gray-200 bg-white hover:border-blue-400'
                            : 'border-gray-100 bg-gray-50 opacity-60 hover:opacity-90'
                      }`}
                    >
                      <span className="text-2xl">{subject.icon}</span>
                      <span className="text-xs font-medium text-gray-800 text-center leading-tight">
                        {uiLanguage === 'zh' ? subject.labelZh : subject.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Subject grid (no framework picked yet) — gentle prompt */}
          {!selectedFramework && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-xs text-gray-500">
              {uiLanguage === 'zh'
                ? '先选一个考试框架，再选科目。'
                : 'Pick a framework first; then choose a subject.'}
            </div>
          )}

          {/* Suggested courses + Continue CTA — visible once both framework and subject are picked. */}
          {selectedFramework && selectedSubject && (() => {
            const courses = getCourseSuggestions(selectedFramework, selectedSubject)
            const fw = getFramework(selectedFramework)
            const fwLabel = uiLanguage === 'zh' ? fw?.labelZh : fw?.label
            return (
              <div className={`rounded-xl border ${fw?.borderClass ?? 'border-gray-200'} ${fw?.bgClass ?? 'bg-gray-50'} p-4 space-y-3 animate-in fade-in duration-300`}>
                {courses.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${fw?.textClass ?? 'text-gray-700'}`}>
                        {uiLanguage === 'zh' ? '推荐课程' : 'Suggested courses'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {uiLanguage === 'zh' ? '点击直接以该课程为目标开始学习计划' : 'Tap to start the plan anchored to that course'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {courses.map((course, ci) => {
                        const display = uiLanguage === 'zh' && course.nameZh ? course.nameZh : course.name
                        const seed =
                          uiLanguage === 'zh'
                            ? `我想学 ${course.nameZh ?? course.name}`
                            : `I want to study ${course.name}`
                        return (
                          <button
                            key={ci}
                            type="button"
                            onClick={() => {
                              handleFrameworkSelect(selectedFramework)
                              setTimeout(() => setUserInput(seed), 60)
                            }}
                            className={`rounded-full border ${fw?.borderClass ?? 'border-gray-300'} bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-medium ${fw?.textClass ?? 'text-gray-800'}`}
                          >
                            {display}
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div className={`text-xs ${fw?.textClass ?? 'text-gray-700'}`}>
                    {uiLanguage === 'zh'
                      ? `${fwLabel} 框架下暂无该科目的官方课程，AI 会按通用大纲为你规划。`
                      : `No official ${fwLabel} course is catalogued for this subject yet — the AI will plan from a general syllabus.`}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleFrameworkSelect(selectedFramework)}
                  className={`w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 transition-colors`}
                >
                  {uiLanguage === 'zh'
                    ? `开始 ${fwLabel} 学习计划 →`
                    : `Continue to ${fwLabel} plan →`}
                </button>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── CHATTING PHASE ──────────────────────────────────────────────────── */}
      {phase === 'chatting' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {uiLanguage === 'zh' ? '和 AI 聊聊你的情况' : 'Tell the AI about your situation'}
            </h2>
            <button
              onClick={() => {
                setPhase('selecting')
                setSelectedFramework(null)
                setChatMessages([])
                setChatStage('opening')
                clearContexts()
              }}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {uiLanguage === 'zh' ? '← 重新选择' : '← Back'}
            </button>
          </div>

          {/* Subject + Framework badge */}
          <div className="flex gap-2 flex-wrap">
            {selectedSubject && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                {SUBJECTS.find((s) => s.id === selectedSubject)?.icon}{' '}
                {uiLanguage === 'zh'
                  ? SUBJECTS.find((s) => s.id === selectedSubject)?.labelZh
                  : SUBJECTS.find((s) => s.id === selectedSubject)?.label}
              </span>
            )}
            {selectedFramework && (
              <span className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-800">
                {uiLanguage === 'zh'
                  ? FRAMEWORKS.find((f) => f.id === selectedFramework)?.labelZh
                  : FRAMEWORKS.find((f) => f.id === selectedFramework)?.label}
              </span>
            )}
          </div>

          {/* Chat window */}
          <div className="h-[60vh] sm:h-[420px] overflow-y-auto space-y-4 p-4 bg-gray-50/50 rounded-lg">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-blue-100 text-blue-900'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="text-sm font-medium mb-1">
                    {message.role === 'user'
                      ? uiLanguage === 'zh'
                        ? '你'
                        : 'You'
                      : uiLanguage === 'zh'
                      ? 'AI 导师'
                      : 'AI Advisor'}
                  </div>
                  <AssistantMessage content={message.content} />
                  {message.role === 'assistant' && message.id === latestOptionMessageId && message.options && message.options.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {message.options.map((opt, oi) => (
                        <button
                          key={`${message.id}-opt-${oi}`}
                          type="button"
                          onClick={() => handleChipClick(opt)}
                          disabled={isTyping}
                          className="rounded-full border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-2">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 rounded-lg p-4 max-w-[80%]">
                  <div className="text-sm font-medium mb-1">
                    {uiLanguage === 'zh' ? 'AI 导师' : 'AI Advisor'}
                  </div>
                  {streamingContent !== null ? (
                    <AssistantMessage content={streamingContent + ' ▍'} />
                  ) : (
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.1s' }}
                      />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.2s' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
                  {error}
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="space-y-2">
            {/* Hidden file inputs */}
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleAudioUpload(f); e.target.value = '' } }}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleImageUpload(f); e.target.value = '' } }}
            />

            {/* Uploaded context pills */}
            {contexts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {contexts.map((ctx) => (
                  <span
                    key={ctx.id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1"
                  >
                    <span className="shrink-0">{ctx.type === 'audio' ? '🎵' : '🖼️'}</span>
                    <span className="max-w-[200px] truncate">{ctx.title}</span>
                    <button
                      type="button"
                      onClick={() => removeContext(ctx.id)}
                      className="shrink-0 ml-0.5 hover:text-blue-600 transition-colors"
                      title={uiLanguage === 'zh' ? '移除' : 'Remove'}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2 items-end">
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  uiLanguage === 'zh'
                    ? '描述你的基础水平、目标、考试时间线…'
                    : 'Describe your current level, goals, exam timeline…'
                }
                rows={2}
                className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                disabled={isTyping}
              />

              {/* Upload buttons */}
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                disabled={isTyping || isUploading}
                className="rounded-lg border border-gray-300 p-2.5 text-gray-500 hover:text-blue-600 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={uiLanguage === 'zh' ? '上传音频' : 'Upload audio'}
              >
                <Mic size={18} />
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={isTyping || isUploading}
                className="rounded-lg border border-gray-300 p-2.5 text-gray-500 hover:text-blue-600 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={uiLanguage === 'zh' ? '上传图片' : 'Upload image'}
              >
                <ImagePlus size={18} />
              </button>

              <button
                onClick={handleSendMessage}
                disabled={isTyping || !userInput.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uiLanguage === 'zh' ? '发送' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PLAN REVIEW PHASE ───────────────────────────────────────────────── */}
      {phase === 'plan_review' && proposedPlan && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
            {/* Plan header */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  {uiLanguage === 'zh' ? '拟定学习计划' : 'Proposed Study Plan'}
                </span>
                {autoSaveStatus === 'saving' && (
                  <span className="text-xs text-gray-400 animate-pulse">
                    {uiLanguage === 'zh' ? '自动保存中...' : 'Auto-saving...'}
                  </span>
                )}
                {autoSaveStatus === 'saved' && (
                  <span className="text-xs text-green-600">
                    {uiLanguage === 'zh' ? '✓ 已自动保存' : '✓ Auto-saved'}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold text-gray-900">{proposedPlan.title}</h2>
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-600">
                <span>
                  {uiLanguage === 'zh' ? '科目：' : 'Subject: '}
                  {uiLanguage === 'zh'
                    ? SUBJECTS.find((s) => s.id === proposedPlan.subject)?.labelZh
                    : SUBJECTS.find((s) => s.id === proposedPlan.subject)?.label}
                </span>
                <span>
                  {uiLanguage === 'zh' ? '框架：' : 'Framework: '}
                  {uiLanguage === 'zh'
                    ? FRAMEWORKS.find((f) => f.id === proposedPlan.framework)?.labelZh
                    : FRAMEWORKS.find((f) => f.id === proposedPlan.framework)?.label}
                </span>
                <span>
                  {uiLanguage === 'zh' ? '预计总时长：' : 'Estimated hours: '}
                  {proposedPlan.estimated_hours}h
                </span>
              </div>
            </div>

            {/* Units list */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                {uiLanguage === 'zh' ? '学习单元' : 'Units'}
              </h3>
              {proposedPlan.units.map((unit, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-gray-200 p-4 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-gray-900">
                        {idx + 1}. {unit.title}
                      </div>
                      {unit.topics.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {unit.topics.map((topic, ti) => (
                            <li key={ti} className="text-sm text-gray-600 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                              {topic}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
                      {unit.estimated_hours}h
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="pt-2 space-y-3">
              <button
                onClick={handleConfirmPlan}
                disabled={isCreating}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uiLanguage === 'zh' ? '看起来不错，开始学习！' : "Looks good, let's go!"}
              </button>

              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  {uiLanguage === 'zh' ? '想要调整？告诉我哪里需要改：' : 'Want changes? Tell me what to adjust:'}
                </p>
                <div className="flex gap-2 items-end">
                  <textarea
                    value={planFeedback}
                    onChange={(e) => setPlanFeedback(e.target.value)}
                    placeholder={
                      uiLanguage === 'zh'
                        ? '例如：增加更多练习题单元，或调整时间分配…'
                        : 'e.g. Add more practice units, adjust time allocation…'
                    }
                    rows={2}
                    className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    onClick={handleRequestChanges}
                    className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {uiLanguage === 'zh' ? '修改' : 'Revise'}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CREATING PHASE ──────────────────────────────────────────────────── */}
      {phase === 'creating' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
          <p className="text-lg font-medium text-gray-800">
            {uiLanguage === 'zh' ? '正在生成你的学习计划…' : 'Creating your study plan…'}
          </p>
          <p className="text-sm text-gray-500">
            {uiLanguage === 'zh' ? '这可能需要几秒钟，请稍候。' : 'This may take a few seconds.'}
          </p>
        </div>
      )}

      {/* ── DONE PHASE ──────────────────────────────────────────────────────── */}
      {phase === 'done' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-5xl">✅</div>
          <p className="text-xl font-semibold text-gray-900">
            {uiLanguage === 'zh' ? '学习计划已创建！' : 'Study plan created!'}
          </p>
          {createdPlanId && (
            <a
              href={`/study-plan/${createdPlanId}`}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              {uiLanguage === 'zh' ? '查看我的计划' : 'View My Plan'}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
