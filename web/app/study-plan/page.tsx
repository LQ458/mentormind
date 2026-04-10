'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '@clerk/nextjs'

// ── Types ────────────────────────────────────────────────────────────────────

type WorkflowPhase = 'selecting' | 'chatting' | 'plan_review' | 'creating' | 'done' | 'gaokao_chatting' | 'gaokao_saving'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
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

// ── Constants ────────────────────────────────────────────────────────────────

const SUBJECTS = [
  // STEM
  { id: 'math', label: 'Mathematics', labelZh: '数学', icon: '📐', category: 'stem' },
  { id: 'physics', label: 'Physics', labelZh: '物理', icon: '⚛️', category: 'stem' },
  { id: 'chemistry', label: 'Chemistry', labelZh: '化学', icon: '🧪', category: 'stem' },
  { id: 'biology', label: 'Biology', labelZh: '生物', icon: '🧬', category: 'stem' },
  { id: 'cs', label: 'Computer Science', labelZh: '计算机科学', icon: '💻', category: 'stem' },
  { id: 'environmental_science', label: 'Environmental Science', labelZh: '环境科学', icon: '🌍', category: 'stem' },
  // Humanities & Social Sciences
  { id: 'history', label: 'History', labelZh: '历史', icon: '📜', category: 'humanities' },
  { id: 'english', label: 'English', labelZh: '英语', icon: '📝', category: 'humanities' },
  { id: 'economics', label: 'Economics', labelZh: '经济学', icon: '📊', category: 'humanities' },
  { id: 'psychology', label: 'Psychology', labelZh: '心理学', icon: '🧠', category: 'humanities' },
  { id: 'government', label: 'Government & Politics', labelZh: '政治学', icon: '🏛️', category: 'humanities' },
  { id: 'world_languages', label: 'World Languages', labelZh: '外国语', icon: '🌐', category: 'humanities' },
  { id: 'art', label: 'Art', labelZh: '艺术', icon: '🎨', category: 'humanities' },
]

const FRAMEWORKS = [
  { id: 'ap', label: 'AP (Advanced Placement)', labelZh: 'AP (美国大学预修)' },
  { id: 'a_level', label: 'A Level (Cambridge)', labelZh: 'A Level (剑桥)' },
  { id: 'ib', label: 'IB (International Baccalaureate)', labelZh: 'IB (国际文凭)' },
  { id: 'gaokao', label: 'Gaokao (高考)', labelZh: '高考' },
  { id: 'general', label: 'General', labelZh: '通用' },
]

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
    return <span key={key} dangerouslySetInnerHTML={{ __html: code }} />
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

  // Gaokao-specific state
  const [gaokaoMessages, setGaokaoMessages] = useState<ChatMessage[]>([])
  const [gaokaoInput, setGaokaoInput] = useState('')
  const [gaokaoTyping, setGaokaoTyping] = useState(false)
  const [gaokaoSessionId, setGaokaoSessionId] = useState<string | null>(null)
  const [gaokaoTopicFocus, setGaokaoTopicFocus] = useState('')
  const [gaokaoStreamingContent, setGaokaoStreamingContent] = useState<string | null>(null)
  const [gaokaoSaving, setGaokaoSaving] = useState(false)

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
  }, [chatMessages, streamingContent, gaokaoMessages, gaokaoStreamingContent])

  // Warn before leaving if there's unsaved work
  useEffect(() => {
    const hasUnsavedWork =
      (phase === 'chatting' && chatMessages.length > 1) ||
      (phase === 'plan_review' && proposedPlan !== null) ||
      (phase === 'gaokao_chatting' && gaokaoMessages.length > 1)

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedWork) {
        e.preventDefault()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [phase, chatMessages.length, proposedPlan, gaokaoMessages.length])

  // ── Subject/Framework Selection ──────────────────────────────────────────

  const handleSubjectSelect = (subjectId: string) => {
    setSelectedSubject(subjectId)
  }

  const handleFrameworkSelect = (frameworkId: string) => {
    setSelectedFramework(frameworkId)
    const subject = SUBJECTS.find((s) => s.id === selectedSubject)

    if (frameworkId === 'gaokao') {
      // Start gaokao chat inline instead of redirecting
      const openingMessage: ChatMessage = {
        id: 'opening_1',
        role: 'assistant',
        content:
          uiLanguage === 'zh'
            ? `你好！我是你的高考${subject?.labelZh ?? ''}助手 ${subject?.icon ?? ''}\n\n有什么${subject?.labelZh ?? ''}问题想搞懂？或者告诉我你现在在复习哪个章节，我来帮你梳理重难点！`
            : `Hi! I'm your Gaokao ${subject?.label ?? ''} tutor ${subject?.icon ?? ''}\n\nWhat ${subject?.label ?? ''} topics would you like to work on? Tell me what you're studying and I'll help!`,
        timestamp: new Date(),
      }
      setGaokaoMessages([openingMessage])
      setPhase('gaokao_chatting')
      return
    }

    // Non-gaokao flow
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

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userInput,
      timestamp: new Date(),
    }

    setChatMessages((prev) => [...prev, userMessage])
    const currentInput = userInput
    setUserInput('')
    setIsTyping(true)
    setError(null)

    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await fetch('/api/backend/study-plan/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          history: [...chatMessages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stage: chatStage,
          subject: selectedSubject,
          framework: selectedFramework,
          language: uiLanguage === 'zh' ? 'zh' : 'en',
        }),
      })

      const data = await response.json()

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
      setError(
        uiLanguage === 'zh'
          ? '网络错误，请检查连接后重试。'
          : 'Network error. Please check your connection and try again.'
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

  // ── Gaokao Chat ──────────────────────────────────────────────────────────

  const handleGaokaoSend = async () => {
    if (!gaokaoInput.trim()) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: gaokaoInput,
      timestamp: new Date(),
    }

    setGaokaoMessages((prev) => [...prev, userMessage])
    const currentInput = gaokaoInput
    setGaokaoInput('')
    setGaokaoTyping(true)
    setError(null)

    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await fetch('/api/backend/gaokao/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: currentInput,
          session_id: gaokaoSessionId,
          subject: selectedSubject,
          topic_focus: gaokaoTopicFocus || undefined,
        }),
      })

      const data = await response.json()

      if (data.session_id) {
        setGaokaoSessionId(data.session_id)
      }

      // Stream the response word by word
      const words = ((data.content ?? '') as string).split(' ')
      setGaokaoStreamingContent('')
      let built = ''
      for (let i = 0; i < words.length; i++) {
        built += (i === 0 ? '' : ' ') + words[i]
        setGaokaoStreamingContent(built)
        await new Promise((r) => setTimeout(r, 28))
      }
      setGaokaoStreamingContent(null)

      const aiResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content ?? '',
        timestamp: new Date(),
      }
      setGaokaoMessages((prev) => [...prev, aiResponse])
    } catch (err) {
      console.error('Gaokao chat error:', err)
      setError(
        uiLanguage === 'zh'
          ? '网络错误，请检查连接后重试。'
          : 'Network error. Please check your connection and try again.'
      )
    } finally {
      setGaokaoTyping(false)
    }
  }

  const handleGaokaoKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGaokaoSend()
    }
  }

  const handleSaveGaokaoPlan = async () => {
    setGaokaoSaving(true)
    setPhase('gaokao_saving')
    setError(null)

    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const subject = SUBJECTS.find((s) => s.id === selectedSubject)
      const title = uiLanguage === 'zh'
        ? `高考${subject?.labelZh ?? ''}复习计划`
        : `Gaokao ${subject?.label ?? ''} Study Plan`

      const response = await fetch('/api/backend/gaokao/save-plan', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title,
          subject: selectedSubject,
          description: gaokaoTopicFocus || '',
          session_id: gaokaoSessionId,
          diagnostic_context: {
            chat_history: gaokaoMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          },
          language: uiLanguage === 'zh' ? 'zh' : 'en',
        }),
      })

      const data = await response.json()

      if (data.success && data.plan_id) {
        setCreatedPlanId(data.plan_id)
        setPhase('done')
        router.push(`/study-plan/${data.plan_id}`)
      } else {
        setError(
          uiLanguage === 'zh'
            ? '计划创建失败，请重试。'
            : 'Failed to create plan. Please try again.'
        )
        setPhase('gaokao_chatting')
      }
    } catch (err) {
      console.error('Gaokao save plan error:', err)
      setError(
        uiLanguage === 'zh'
          ? '网络错误，计划保存失败。'
          : 'Network error. Failed to save plan.'
      )
      setPhase('gaokao_chatting')
    } finally {
      setGaokaoSaving(false)
    }
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          {uiLanguage === 'zh' ? '学习计划' : 'Study Plans'}
        </h1>
        <p className="text-gray-600 mt-1">
          {uiLanguage === 'zh'
            ? '查看已有计划或创建新的学习计划。'
            : 'View your existing plans or create a new one.'}
        </p>
      </div>

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

      {/* Phase indicator */}
      <div className="grid grid-cols-4 gap-2">
        {(selectedFramework === 'gaokao' || phase === 'gaokao_chatting' || phase === 'gaokao_saving'
          ? [
              { key: 'selecting', label: uiLanguage === 'zh' ? '1. 选择科目' : '1. Select' },
              { key: 'gaokao_chatting', label: uiLanguage === 'zh' ? '2. AI 辅导' : '2. Tutor' },
              { key: 'gaokao_saving', label: uiLanguage === 'zh' ? '3. 保存计划' : '3. Save' },
              { key: 'done', label: uiLanguage === 'zh' ? '4. 完成' : '4. Done' },
            ]
          : [
              { key: 'selecting', label: uiLanguage === 'zh' ? '1. 选择科目' : '1. Select' },
              { key: 'chatting', label: uiLanguage === 'zh' ? '2. 对话诊断' : '2. Chat' },
              { key: 'plan_review', label: uiLanguage === 'zh' ? '3. 确认计划' : '3. Review' },
              { key: 'creating', label: uiLanguage === 'zh' ? '4. 生成计划' : '4. Create' },
            ]
        ).map((step) => (
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
          {/* Subject grid */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {uiLanguage === 'zh' ? '选择科目' : 'Choose a Subject'}
            </h2>
            {/* STEM */}
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              {uiLanguage === 'zh' ? '理工科' : 'STEM'}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-4">
              {SUBJECTS.filter((s) => s.category === 'stem').map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => handleSubjectSelect(subject.id)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:border-blue-400 hover:shadow-sm ${
                    selectedSubject === subject.id
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <span className="text-2xl">{subject.icon}</span>
                  <span className="text-xs font-medium text-gray-800 text-center leading-tight">
                    {uiLanguage === 'zh' ? subject.labelZh : subject.label}
                  </span>
                </button>
              ))}
            </div>
            {/* Humanities & Social Sciences */}
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              {uiLanguage === 'zh' ? '人文社科' : 'Humanities & Social Sciences'}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
              {SUBJECTS.filter((s) => s.category === 'humanities').map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => handleSubjectSelect(subject.id)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:border-blue-400 hover:shadow-sm ${
                    selectedSubject === subject.id
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <span className="text-2xl">{subject.icon}</span>
                  <span className="text-xs font-medium text-gray-800 text-center leading-tight">
                    {uiLanguage === 'zh' ? subject.labelZh : subject.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Framework selection — visible once a subject is picked */}
          {selectedSubject && (
            <div className="animate-in fade-in duration-300">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {uiLanguage === 'zh' ? '选择考试框架' : 'Choose a Framework'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FRAMEWORKS.map((framework) => (
                  <button
                    key={framework.id}
                    onClick={() => handleFrameworkSelect(framework.id)}
                    className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all hover:border-blue-400 hover:shadow-sm ${
                      selectedFramework === framework.id
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div>
                      <div className="font-medium text-gray-900">
                        {uiLanguage === 'zh' ? framework.labelZh : framework.label}
                      </div>
                      {framework.id === 'gaokao' && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {uiLanguage === 'zh' ? '高考专属 AI 辅导模式' : 'Gaokao-specific AI tutoring mode'}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
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
          <div className="h-[420px] overflow-y-auto space-y-4 p-4 bg-gray-50/50 rounded-lg">
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
            <button
              onClick={handleSendMessage}
              disabled={isTyping || !userInput.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uiLanguage === 'zh' ? '发送' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* ── GAOKAO CHATTING PHASE ─────────────────────────────────────────── */}
      {phase === 'gaokao_chatting' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">
                  {uiLanguage === 'zh' ? '高' : 'G'}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                {uiLanguage === 'zh' ? '高考智能辅导' : 'Gaokao AI Tutoring'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveGaokaoPlan}
                disabled={gaokaoMessages.length < 3 || gaokaoSaving}
                className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uiLanguage === 'zh' ? '保存为学习计划' : 'Save as Study Plan'}
              </button>
              <button
                onClick={() => {
                  setPhase('selecting')
                  setSelectedFramework(null)
                  setGaokaoMessages([])
                  setGaokaoSessionId(null)
                }}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                {uiLanguage === 'zh' ? '← 重新选择' : '← Back'}
              </button>
            </div>
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
            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
              {uiLanguage === 'zh' ? '高考' : 'Gaokao'}
            </span>
          </div>

          {/* Topic focus */}
          <input
            type="text"
            value={gaokaoTopicFocus}
            onChange={(e) => setGaokaoTopicFocus(e.target.value)}
            placeholder={
              uiLanguage === 'zh'
                ? '当前学习主题（选填）：如"导数应用"、"电磁感应"…'
                : 'Current study topic (optional): e.g. "derivatives", "electromagnetism"…'
            }
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
          />

          {/* Chat window */}
          <div className="h-[420px] overflow-y-auto space-y-4 p-4 bg-gray-50/50 rounded-lg">
            {gaokaoMessages.map((message) => (
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
                      ? uiLanguage === 'zh' ? '你' : 'You'
                      : uiLanguage === 'zh' ? '高考助手' : 'Gaokao Tutor'}
                  </div>
                  <AssistantMessage content={message.content} />
                  <div className="text-xs text-gray-500 mt-2">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}

            {gaokaoTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 rounded-lg p-4 max-w-[80%]">
                  <div className="text-sm font-medium mb-1">
                    {uiLanguage === 'zh' ? '高考助手' : 'Gaokao Tutor'}
                  </div>
                  {gaokaoStreamingContent !== null ? (
                    <AssistantMessage content={gaokaoStreamingContent + ' ▍'} />
                  ) : (
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
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
          <div className="flex gap-2 items-end">
            <textarea
              value={gaokaoInput}
              onChange={(e) => setGaokaoInput(e.target.value)}
              onKeyDown={handleGaokaoKeyDown}
              placeholder={
                uiLanguage === 'zh'
                  ? '问我关于高考的任何问题…（Enter 发送，Shift+Enter 换行）'
                  : 'Ask me anything about Gaokao prep… (Enter to send, Shift+Enter for new line)'
              }
              rows={2}
              className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              disabled={gaokaoTyping}
            />
            <button
              onClick={handleGaokaoSend}
              disabled={gaokaoTyping || !gaokaoInput.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uiLanguage === 'zh' ? '发送' : 'Send'}
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center">
            {uiLanguage === 'zh'
              ? 'AI 生成内容仅供参考，请以课本和老师讲解为准'
              : 'AI-generated content is for reference only'}
          </p>
        </div>
      )}

      {/* ── GAOKAO SAVING PHASE ──────────────────────────────────────────────── */}
      {phase === 'gaokao_saving' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
          <p className="text-lg font-medium text-gray-800">
            {uiLanguage === 'zh' ? '正在保存高考学习计划…' : 'Saving your Gaokao study plan…'}
          </p>
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
