'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLanguage } from '../../components/LanguageContext'
import { useAuth } from '@clerk/nextjs'

type LessonTab = 'content' | 'seminar' | 'practice' | 'script' | 'video'

interface LessonState {
  progress_percentage: number
  is_completed: boolean
  time_spent_minutes: number
  last_accessed_at: string | null
  recent_interactions_by_type?: Record<string, Array<{
    id: number
    interaction_type: string
    user_input: string
    agent_output?: Record<string, any>
    created_at?: string | null
  }>>
  latest_performance?: {
    assessment_type: string
    score: number
    confidence: number
    reflection?: string | null
  } | null
  next_review?: {
    due_at: string
    interval_hours: number
    metadata?: {
      trigger?: string
      mastery?: number
    }
  } | null
}

interface SeminarTurnResult {
  messages: Array<{
    role: string
    message: string
  }>
  synthesis: string
  next_moderator_prompt: string
}

interface AssessmentScoreHint {
  score: number
  confidence: number
  strengths: string[]
  struggles: string[]
  reflection: string
}

interface SimulationTurnResult {
  counterparty_role: string
  counterparty_message: string
  pressure: string
  coach_feedback: string
  next_prompt: string
  score_hint?: AssessmentScoreHint
}

interface OralDefenseTurnResult {
  panel: Array<{
    role: string
    message: string
  }>
  verdict: string
  next_question: string
  score_hint?: AssessmentScoreHint
}

interface MemoryChallengeResult {
  title: string
  prompt: string
  questions: string[]
  self_check: string[]
  recommended_reflection: string
}

interface DeliberateErrorResult {
  title: string
  flawed_claim: string
  audit_prompt: string
  hints: string[]
  correction_target: string
  score_hint?: AssessmentScoreHint
}

export default function LessonDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { language, t } = useLanguage()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const [lesson, setLesson] = useState<any>(null)
  const [lessonState, setLessonState] = useState<LessonState | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<LessonTab>('seminar')
  const [savingProgress, setSavingProgress] = useState(false)
  const [recordingAssessment, setRecordingAssessment] = useState<string | null>(null)

  // F: Video engagement tracking
  const lastReportedCheckpointRef = useRef<number>(-1)

  const reportVideoEngagement = useCallback(async (watchPct: number, quizDone = false) => {
    if (!params?.id || !isSignedIn) return
    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      await fetch(`/api/backend/users/me/lessons/${params.id}/video-engagement`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ watch_percentage: watchPct, quiz_completed: quizDone }),
      })
    } catch (err) {
      // non-critical — swallow silently
    }
  }, [params?.id, isSignedIn, getToken])

  const handleVideoTimeUpdate = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget
    if (!video.duration) return
    const pct = Math.floor((video.currentTime / video.duration) * 100)
    const checkpoint = Math.floor(pct / 10) * 10  // snap to nearest 10%
    if (checkpoint > lastReportedCheckpointRef.current && checkpoint >= 10) {
      lastReportedCheckpointRef.current = checkpoint
      void reportVideoEngagement(checkpoint)
    }
  }, [reportVideoEngagement])

  const handleVideoEnded = useCallback(() => {
    lastReportedCheckpointRef.current = 100
    void reportVideoEngagement(100, false)
  }, [reportVideoEngagement])

  const [seminarPrompt, setSeminarPrompt] = useState('')
  const [seminarLoading, setSeminarLoading] = useState(false)
  const [seminarTurn, setSeminarTurn] = useState<SeminarTurnResult | null>(null)
  const [simulationInput, setSimulationInput] = useState('')
  const [simulationLoading, setSimulationLoading] = useState(false)
  const [simulationTurn, setSimulationTurn] = useState<SimulationTurnResult | null>(null)
  const [oralDefenseInput, setOralDefenseInput] = useState('')
  const [oralDefenseLoading, setOralDefenseLoading] = useState(false)
  const [oralDefenseTurn, setOralDefenseTurn] = useState<OralDefenseTurnResult | null>(null)
  const [memoryChallengeLoading, setMemoryChallengeLoading] = useState(false)
  const [memoryChallenge, setMemoryChallenge] = useState<MemoryChallengeResult | null>(null)
  const [deliberateErrorLoading, setDeliberateErrorLoading] = useState(false)
  const [deliberateErrorChallenge, setDeliberateErrorChallenge] = useState<DeliberateErrorResult | null>(null)

  useEffect(() => {
    if (params?.id) {
      fetchLessonDetails(params.id as string)
    }
  }, [params?.id])

  useEffect(() => {
    if (!params?.id || !isLoaded || !isSignedIn) {
      setLessonState(null)
      return
    }
    fetchLessonState(params.id as string)
  }, [params?.id, isLoaded, isSignedIn])

  const fetchLessonDetails = async (id: string) => {
    try {
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const response = await fetch(`/api/backend/lessons/${id}`, { headers })
      if (!response.ok) {
        throw new Error('Failed to fetch lesson')
      }
      const data = await response.json()
      setLesson(data.lesson)
    } catch (error) {
      console.error('Error fetching lesson:', error)
      alert(t('common.error'))
      router.push('/lessons')
    } finally {
      setLoading(false)
    }
  }

  const fetchLessonState = async (id: string) => {
    try {
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const response = await fetch(`/api/backend/users/me/lessons/${id}/state`, { headers })
      if (!response.ok) {
        throw new Error(`Failed to load lesson state: ${response.status}`)
      }
      const data = await response.json()
      setLessonState(data.state)
    } catch (error) {
      console.error('Failed to fetch lesson state:', error)
    }
  }

  const updateLessonProgress = async (progressPercentage: number, isCompleted: boolean) => {
    if (!params?.id || !isSignedIn) return
    setSavingProgress(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(`/api/backend/users/me/lessons/${params.id}/progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          progress_percentage: progressPercentage,
          is_completed: isCompleted,
          time_spent_minutes: lesson?.duration_minutes || 0,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to update progress: ${response.status}`)
      }

      await fetchLessonState(params.id as string)
    } catch (error) {
      console.error('Failed to update lesson progress:', error)
    } finally {
      setSavingProgress(false)
    }
  }

  const recordPerformance = async (
    assessmentType: string,
    score: number,
    confidence: number,
    reflection: string,
    strengths: string[],
    struggles: string[]
  ) => {
    if (!params?.id || !isSignedIn) return
    setRecordingAssessment(assessmentType)
    try {
      const token = await getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(`/api/backend/users/me/lessons/${params.id}/performance`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          assessment_type: assessmentType,
          score,
          confidence,
          reflection,
          strengths,
          struggles,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to record performance: ${response.status}`)
      }

      await fetchLessonState(params.id as string)
    } catch (error) {
      console.error('Failed to record performance:', error)
    } finally {
      setRecordingAssessment(null)
    }
  }

  const runSeminarTurn = async () => {
    if (!params?.id || !isSignedIn || !seminarPrompt.trim()) return
    setSeminarLoading(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(`/api/backend/users/me/lessons/${params.id}/seminar`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          moderator_input: seminarPrompt.trim(),
          focus: lesson?.process_layer?.intervention_recommendation?.label || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to run seminar: ${response.status}`)
      }

      const data = await response.json()
      setSeminarTurn(data.seminar)
      await fetchLessonState(params.id as string)
    } catch (error) {
      console.error('Failed to run seminar turn:', error)
    } finally {
      setSeminarLoading(false)
    }
  }

  const runSimulationTurn = async () => {
    if (!params?.id || !isSignedIn || !simulationInput.trim()) return
    setSimulationLoading(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(`/api/backend/users/me/lessons/${params.id}/simulation`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          learner_action: simulationInput.trim(),
          scenario_focus: lesson?.process_layer?.simulation?.title || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to run simulation: ${response.status}`)
      }

      const data = await response.json()
      setSimulationTurn(data.simulation)
      await fetchLessonState(params.id as string)
    } catch (error) {
      console.error('Failed to run simulation turn:', error)
    } finally {
      setSimulationLoading(false)
    }
  }

  const runOralDefenseTurn = async () => {
    if (!params?.id || !isSignedIn || !oralDefenseInput.trim()) return
    setOralDefenseLoading(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(`/api/backend/users/me/lessons/${params.id}/oral-defense`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          learner_answer: oralDefenseInput.trim(),
          focus: lesson?.process_layer?.oral_defense?.panel_title || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to run oral defense: ${response.status}`)
      }

      const data = await response.json()
      setOralDefenseTurn(data.oral_defense)
      await fetchLessonState(params.id as string)
    } catch (error) {
      console.error('Failed to run oral defense turn:', error)
    } finally {
      setOralDefenseLoading(false)
    }
  }

  const generateMemoryChallenge = async () => {
    if (!params?.id || !isSignedIn) return
    setMemoryChallengeLoading(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(`/api/backend/users/me/lessons/${params.id}/memory-challenge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          focus: lesson?.process_layer?.intervention_recommendation?.label || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to generate memory challenge: ${response.status}`)
      }

      const data = await response.json()
      setMemoryChallenge(data.memory_challenge)
    } catch (error) {
      console.error('Failed to generate memory challenge:', error)
    } finally {
      setMemoryChallengeLoading(false)
    }
  }

  const generateDeliberateErrorChallenge = async () => {
    if (!params?.id || !isSignedIn) return
    setDeliberateErrorLoading(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(`/api/backend/users/me/lessons/${params.id}/deliberate-error`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          focus: lesson?.process_layer?.intervention_recommendation?.label || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to generate deliberate error challenge: ${response.status}`)
      }

      const data = await response.json()
      setDeliberateErrorChallenge(data.deliberate_error)
      await fetchLessonState(params.id as string)
    } catch (error) {
      console.error('Failed to generate deliberate error challenge:', error)
    } finally {
      setDeliberateErrorLoading(false)
    }
  }

  const saveGeneratedAssessment = async (
    assessmentType: string,
    scoreHint?: AssessmentScoreHint
  ) => {
    if (!scoreHint) return
    await recordPerformance(
      assessmentType,
      scoreHint.score,
      scoreHint.confidence,
      scoreHint.reflection,
      scoreHint.strengths,
      scoreHint.struggles,
    )
  }

  const toProxyUrl = (rawPath: string | null): string | null => {
    if (!rawPath) return null
    if (rawPath.startsWith('http')) return rawPath
    const cleanPath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath
    return `/api/backend/media/${cleanPath}`
  }

  const seminarCards = useMemo(() => {
    if (!lesson) return []
    const roleCards = lesson.process_layer?.seminar?.roles
    if (Array.isArray(roleCards) && roleCards.length > 0) {
      return roleCards.map((role: any, index: number) => ({
        role: role.name,
        accent: index === 0
          ? 'bg-slate-100 text-slate-900'
          : index === 1
          ? 'bg-emerald-100 text-emerald-900'
          : 'bg-amber-100 text-amber-900',
        prompt: role.stance,
      }))
    }
    const objectives = lesson.objectives?.map((item: any) => item.objective) || []
    const firstObjective = objectives[0] || (language === 'zh' ? '解释本课的核心概念' : 'Explain the core concept of the lesson')
    const secondObjective = objectives[1] || (language === 'zh' ? '连接图像、规则与例子' : 'Connect the visual model, rule, and example')
    return [
      {
        role: language === 'zh' ? '导师' : 'Mentor',
        accent: 'bg-slate-100 text-slate-900',
        prompt: language === 'zh'
          ? `请先用一句话说明“${lesson.class_title || lesson.title}”真正想让学生抓住的思维模型。`
          : `Start by naming the mental model that matters most in "${lesson.class_title || lesson.title}".`,
      },
      {
        role: language === 'zh' ? '高水平同伴' : 'High Achiever',
        accent: 'bg-emerald-100 text-emerald-900',
        prompt: language === 'zh'
          ? `我会把它和这个目标联系起来：${firstObjective}`
          : `I would connect it to this target: ${firstObjective}`,
      },
      {
        role: language === 'zh' ? '吃力中的同伴' : 'Struggling Learner',
        accent: 'bg-amber-100 text-amber-900',
        prompt: language === 'zh'
          ? `我卡住的地方可能是：${secondObjective}`
          : `The place I would probably get stuck is: ${secondObjective}`,
      },
    ]
  }, [lesson, language])

  const moderatorPrompts = useMemo(() => {
    if (!lesson) return []
    const moderatorPrompt = lesson.process_layer?.seminar?.moderator_prompt
    if (moderatorPrompt) {
      return [moderatorPrompt]
    }
    return language === 'zh'
      ? [
          '先总结三位角色分别代表的观点。',
          '指出谁的理解最完整，谁忽略了关键条件。',
          '用你自己的例子做最终裁决。',
        ]
      : [
          'Summarize the viewpoint each role is representing.',
          'Decide whose reasoning is most complete and who missed an important condition.',
          'End by resolving the discussion with your own example.',
        ]
  }, [lesson, language])

  const practiceMissions = useMemo(() => (
    language === 'zh'
      ? [
          {
            id: 'memory_challenge',
            title: '3 分钟记忆挑战',
            description: '不回看视频，直接解释这节课的关键规律、例子和一个常见误区。',
            strong: {
              label: '我能教给别人',
              reflection: '我已经能不用提示解释这节课的关键思路。',
              strengths: ['独立回忆', '结构化表达'],
              struggles: [],
              score: 0.88,
              confidence: 0.84,
            },
            weak: {
              label: '我还需要再练',
              reflection: '我能部分回忆，但还不够稳定，需要更短的复习间隔。',
              strengths: ['意识到薄弱点'],
              struggles: ['回忆不稳定', '需要更多检索练习'],
              score: 0.46,
              confidence: 0.42,
            },
          },
          {
            id: 'deliberate_error',
            title: '刻意错误审计',
            description: '假设老师刚才在推理里故意留了一个错误。请找出最可能出错的一步，并说明为什么。',
            strong: {
              label: '我找到了疑点',
              reflection: '我能指出推理里最危险的一步，并解释原因。',
              strengths: ['批判性检查', '条件审计'],
              struggles: [],
              score: 0.81,
              confidence: 0.72,
            },
            weak: {
              label: '我还分不清',
              reflection: '我还不能稳定识别错误，需要更多对比示例。',
              strengths: ['知道自己会混淆'],
              struggles: ['易被表面步骤带走'],
              score: 0.38,
              confidence: 0.35,
            },
          },
          {
            id: 'oral_defense',
            title: '专家小组口头答辩',
            description: '试着用 60 秒回答：为什么这个概念成立？它在什么条件下会失效？',
            strong: {
              label: '我可以辩护',
              reflection: '我可以清楚说明原理、条件和边界。',
              strengths: ['口头推理', '边界条件'],
              struggles: [],
              score: 0.9,
              confidence: 0.78,
            },
            weak: {
              label: '我答得不稳',
              reflection: '我知道结论，但还难以口头捍卫推理过程。',
              strengths: ['记住部分结论'],
              struggles: ['难以口头组织论证'],
              score: 0.5,
              confidence: 0.44,
            },
          },
        ]
      : [
          {
            id: 'memory_challenge',
            title: '3-Minute Memory Challenge',
            description: 'Without replaying the lesson, explain the key rule, one example, and one common mistake.',
            strong: {
              label: 'I could teach this',
              reflection: 'I can explain the main idea without prompts.',
              strengths: ['independent recall', 'clear explanation'],
              struggles: [],
              score: 0.88,
              confidence: 0.84,
            },
            weak: {
              label: 'I need another pass',
              reflection: 'I can recall parts of it, but not reliably enough yet.',
              strengths: ['aware of weak spots'],
              struggles: ['unstable recall', 'needs more retrieval practice'],
              score: 0.46,
              confidence: 0.42,
            },
          },
          {
            id: 'deliberate_error',
            title: 'Deliberate Error Audit',
            description: 'Assume one step in the reasoning was intentionally flawed. Identify the most likely weak step and explain why.',
            strong: {
              label: 'I spotted the risk',
              reflection: 'I can identify the fragile step in the reasoning and justify it.',
              strengths: ['critical checking', 'condition awareness'],
              struggles: [],
              score: 0.81,
              confidence: 0.72,
            },
            weak: {
              label: 'I still miss it',
              reflection: 'I still struggle to spot the mistake without guided comparison.',
              strengths: ['aware of confusion'],
              struggles: ['surface-level checking'],
              score: 0.38,
              confidence: 0.35,
            },
          },
          {
            id: 'oral_defense',
            title: 'Expert Panel Oral Defense',
            description: 'Answer this in 60 seconds: why does the idea work, and under what conditions does it break down?',
            strong: {
              label: 'I can defend it',
              reflection: 'I can explain the principle, the conditions, and the boundaries.',
              strengths: ['oral reasoning', 'boundary conditions'],
              struggles: [],
              score: 0.9,
              confidence: 0.78,
            },
            weak: {
              label: 'My defense is shaky',
              reflection: 'I remember the answer, but I cannot defend the reasoning smoothly yet.',
              strengths: ['partial recall'],
              struggles: ['hard to articulate reasoning'],
              score: 0.5,
              confidence: 0.44,
            },
          },
        ]
  ), [language])

  const recommendedIntervention = lesson?.process_layer?.intervention_recommendation
  const oralDefenseQuestions = lesson?.process_layer?.oral_defense?.questions || []
  const simulationScenario = lesson?.process_layer?.simulation
  const thinkingPath = lesson?.process_layer?.thinking_path
  const clearLessonPlan = lesson?.ai_insights?.lesson_plan || {}
  const lessonBlueprint = lesson?.ai_insights?.lesson_blueprint || lesson?.ai_insights?.generation_debug?.generation_pipeline || {}
  const lessonChapters = clearLessonPlan?.chapters || lessonBlueprint?.syllabus?.chapters || []
  const transcriptText = lesson?.ai_insights?.full_transcript || lesson?.ai_insights?.script?.script_text || ''
  const sceneScript = lesson?.ai_insights?.script?.scene_script || []
  const recentSeminarHistory = lessonState?.recent_interactions_by_type?.seminar || []
  const recentSimulationHistory = lessonState?.recent_interactions_by_type?.simulation || []
  const recentOralDefenseHistory = lessonState?.recent_interactions_by_type?.oral_defense || []
  const recentDeliberateErrorHistory = lessonState?.recent_interactions_by_type?.deliberate_error || []

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!lesson) return null

  const rawVideoUrl = lesson.video_url || null
  const videoUrl = toProxyUrl(rawVideoUrl)
  const completion = lessonState?.progress_percentage || 0
  const nextReviewDate = lessonState?.next_review?.due_at
    ? new Date(lessonState.next_review.due_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')
    : null

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
                  <Link href="/lessons" className="text-gray-500 hover:text-gray-900 mr-4 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900 truncate max-w-lg">
                  {lesson.title || lesson.class_title}
                </h1>
                <p className="text-sm text-gray-500">
                  {new Date(lesson.created_at || lesson.timestamp).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')} • {lesson.duration_minutes} {t('common.minutes')} • {lesson.student_level}
                </p>
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setActiveTab('practice')}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
              >
                {language === 'zh' ? '练习任务' : 'Practice Mission'}
              </button>
              <button
                onClick={() => updateLessonProgress(100, true)}
                disabled={!isSignedIn || savingProgress}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
              >
                {savingProgress
                  ? (language === 'zh' ? '保存中...' : 'Saving...')
                  : (language === 'zh' ? '完成并安排复习' : 'Complete & Schedule Review')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-black rounded-2xl overflow-hidden shadow-lg aspect-video relative group">
              {videoUrl ? (
                <video
                  key={videoUrl}
                  controls
                  className="w-full h-full object-contain"
                  poster={lesson.ai_insights?.avatar_image || "/placeholder-video.jpg"}
                  preload="metadata"
                  onTimeUpdate={handleVideoTimeUpdate}
                  onEnded={handleVideoEnded}
                >
                  <source src={videoUrl} type="video/mp4" />
                  {t('lessonDetail.browserNoVideo')}
                </video>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">
                  <div className="text-center">
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <p className="text-lg font-medium">{t('lessonDetail.noVideoAvailable')}</p>
                    <p className="text-sm text-gray-500 mt-2">{t('lessonDetail.noVideoDesc')}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="flex border-b border-gray-200 overflow-x-auto">
                {[
                  { id: 'seminar', label: language === 'zh' ? '研讨' : 'Seminar' },
                  { id: 'practice', label: language === 'zh' ? '练习' : 'Practice' },
                  { id: 'content', label: t('lessonDetail.tabLessonPlan') },
                  { id: 'script', label: t('lessonDetail.tabTranscript') },
                  { id: 'video', label: t('lessonDetail.tabAiInsights') },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as LessonTab)}
                    className={`flex-1 min-w-[120px] py-4 text-sm font-medium text-center ${activeTab === tab.id
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {activeTab === 'seminar' && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {language === 'zh' ? '多智能体研讨' : 'Multi-Agent Seminar'}
                      </h3>
                      <p className="mt-2 text-sm text-slate-600">
                        {language === 'zh'
                          ? '你不是旁观者，而是这场讨论的主持人。先听三种立场，再做综合判断。'
                          : 'You are not just watching. You are the moderator. Listen to three roles, then synthesize and decide.'}
                      </p>
                    </div>

                    {thinkingPath && (
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <div className="text-sm font-semibold text-slate-900">
                          {language === 'zh' ? '思维路径' : 'Thinking Path'}
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {thinkingPath.summary}
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                          {thinkingPath.nodes?.map((node: any, index: number) => (
                            <div key={node.id} className="flex items-center gap-2">
                              <span className="rounded-full bg-slate-100 px-3 py-1">{node.label}</span>
                              {index < (thinkingPath.nodes?.length || 0) - 1 && <span className="text-slate-400">→</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid md:grid-cols-3 gap-4">
                      {seminarCards.map((card) => (
                        <div key={card.role} className="rounded-xl border border-slate-200 bg-white p-5">
                          <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${card.accent}`}>
                            {card.role}
                          </div>
                          <p className="mt-4 text-sm leading-7 text-slate-700">{card.prompt}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                      <h4 className="text-sm font-semibold uppercase tracking-wide text-blue-900">
                        {language === 'zh' ? '你的主持任务' : 'Your Moderator Tasks'}
                      </h4>
                      <div className="mt-3 space-y-2">
                        {moderatorPrompts.map((prompt) => (
                          <div key={prompt} className="text-sm text-blue-900">{prompt}</div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-900">
                            {language === 'zh' ? '主持一轮真实研讨' : 'Run a Live Seminar Turn'}
                          </h4>
                          <p className="mt-2 text-sm text-slate-600">
                            {language === 'zh'
                              ? '输入你想追问的角度，后台会生成三位角色的即时回应和一段综合判断。'
                              : 'Enter the angle you want to probe, and the backend will generate fresh responses from the three roles plus a synthesis.'}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-3">
                        <input
                          type="text"
                          value={seminarPrompt}
                          onChange={(e) => setSeminarPrompt(e.target.value)}
                          placeholder={language === 'zh' ? '例如：请你们用一个例子争论谁的理解更完整' : 'For example: Use one example to argue whose understanding is more complete'}
                          className="flex-1 rounded-lg border border-slate-300 px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          onClick={runSeminarTurn}
                          disabled={!isSignedIn || seminarLoading || !seminarPrompt.trim()}
                          className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {seminarLoading
                            ? (language === 'zh' ? '生成中...' : 'Generating...')
                            : (language === 'zh' ? '开始研讨' : 'Run Seminar')}
                        </button>
                      </div>

                      {!isSignedIn && (
                        <p className="mt-3 text-xs text-slate-500">
                          {language === 'zh'
                            ? '登录后即可使用真实多智能体研讨。'
                            : 'Sign in to use the live multi-agent seminar.'}
                        </p>
                      )}
                    </div>

                    {seminarTurn && (
                      <div className="space-y-4">
                        <div className="grid md:grid-cols-3 gap-4">
                          {seminarTurn.messages.map((item, index) => (
                            <div key={`${item.role}-${index}`} className="rounded-xl border border-slate-200 bg-white p-5">
                              <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                                index === 0 ? 'bg-slate-100 text-slate-900' : index === 1 ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
                              }`}>
                                {item.role}
                              </div>
                              <p className="mt-4 text-sm leading-7 text-slate-700">{item.message}</p>
                            </div>
                          ))}
                        </div>

                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                          <div className="text-sm font-semibold uppercase tracking-wide text-blue-900">
                            {language === 'zh' ? '综合判断' : 'Synthesis'}
                          </div>
                          <p className="mt-2 text-sm text-blue-900">{seminarTurn.synthesis}</p>
                          <div className="mt-4 text-sm font-medium text-blue-950">
                            {language === 'zh' ? '下一步主持问题：' : 'Next moderator prompt:'}
                          </div>
                          <p className="mt-1 text-sm text-blue-900">{seminarTurn.next_moderator_prompt}</p>
                        </div>
                      </div>
                    )}

                    {recentSeminarHistory.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <div className="text-sm font-semibold uppercase tracking-wide text-slate-900">
                          {language === 'zh' ? '最近的主持轨迹' : 'Recent Moderation Trail'}
                        </div>
                        <div className="mt-4 space-y-3">
                          {recentSeminarHistory.slice(-3).map((item) => (
                            <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                              <div className="text-xs font-medium text-slate-500">
                                {item.created_at ? new Date(item.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : ''}
                              </div>
                              <div className="mt-2 text-sm text-slate-900">
                                <span className="font-medium">{language === 'zh' ? '你问：' : 'You asked:'}</span> {item.user_input}
                              </div>
                              <div className="mt-2 text-sm text-slate-600">
                                <span className="font-medium">{language === 'zh' ? '系统综合：' : 'System synthesis:'}</span> {String(item.agent_output?.synthesis || '')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'practice' && (
                  <div className="space-y-4">
                    {recommendedIntervention && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
                        <div className="text-sm font-semibold uppercase tracking-wide text-blue-900">
                          {language === 'zh' ? '当前最推荐的下一步' : 'Recommended Next Move'}
                        </div>
                        <h3 className="mt-2 text-lg font-semibold text-blue-950">{recommendedIntervention.label}</h3>
                        <p className="mt-2 text-sm text-blue-900">{recommendedIntervention.reason}</p>
                        <div className="mt-4">
                          <div className="flex flex-wrap gap-3">
                            <button
                              onClick={generateMemoryChallenge}
                              disabled={!isSignedIn || memoryChallengeLoading}
                              className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
                            >
                              {memoryChallengeLoading
                                ? (language === 'zh' ? '生成中...' : 'Generating...')
                                : (language === 'zh' ? '生成 3 分钟挑战' : 'Generate 3-Minute Challenge')}
                            </button>
                            <button
                              onClick={generateDeliberateErrorChallenge}
                              disabled={!isSignedIn || deliberateErrorLoading}
                              className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-blue-800 border border-blue-300 hover:border-blue-400 disabled:opacity-50"
                            >
                              {deliberateErrorLoading
                                ? (language === 'zh' ? '生成中...' : 'Generating...')
                                : (language === 'zh' ? '生成刻意错误审计' : 'Generate Error Audit')}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {memoryChallenge && (
                      <div className="rounded-xl border border-blue-200 bg-white p-5">
                        <h3 className="text-lg font-semibold text-slate-900">{memoryChallenge.title}</h3>
                        <p className="mt-2 text-sm text-slate-600">{memoryChallenge.prompt}</p>
                        <div className="mt-4 space-y-2">
                          {memoryChallenge.questions.map((question) => (
                            <div key={question} className="text-sm text-slate-700">• {question}</div>
                          ))}
                        </div>
                        <div className="mt-4 rounded-lg bg-blue-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-blue-900">
                            {language === 'zh' ? '自检清单' : 'Self-Check'}
                          </div>
                          <div className="mt-2 space-y-2">
                            {memoryChallenge.self_check.map((item) => (
                              <div key={item} className="text-sm text-blue-900">• {item}</div>
                            ))}
                          </div>
                          <p className="mt-3 text-sm text-blue-900">{memoryChallenge.recommended_reflection}</p>
                        </div>
                      </div>
                    )}

                    {deliberateErrorChallenge && (
                      <div className="rounded-xl border border-amber-200 bg-white p-5">
                        <h3 className="text-lg font-semibold text-slate-900">{deliberateErrorChallenge.title}</h3>
                        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                            {language === 'zh' ? '带错的说法' : 'Flawed Claim'}
                          </div>
                          <p className="mt-2 text-sm text-amber-950">{deliberateErrorChallenge.flawed_claim}</p>
                        </div>
                        <p className="mt-4 text-sm text-slate-700">{deliberateErrorChallenge.audit_prompt}</p>
                        <div className="mt-4 space-y-2">
                          {deliberateErrorChallenge.hints.map((hint) => (
                            <div key={hint} className="text-sm text-slate-700">• {hint}</div>
                          ))}
                        </div>
                        <div className="mt-4 rounded-lg bg-amber-50 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                            {language === 'zh' ? '修正目标' : 'Correction Target'}
                          </div>
                          <p className="mt-2 text-sm text-amber-950">{deliberateErrorChallenge.correction_target}</p>
                        </div>
                        {deliberateErrorChallenge.score_hint && (
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              onClick={() => saveGeneratedAssessment('deliberate_error', deliberateErrorChallenge.score_hint)}
                              disabled={!isSignedIn || recordingAssessment === 'deliberate_error'}
                              className="rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                            >
                              {recordingAssessment === 'deliberate_error'
                                ? (language === 'zh' ? '保存中...' : 'Saving...')
                                : (language === 'zh' ? '保存这一轮表现' : 'Save This Round')}
                            </button>
                            <div className="text-xs text-amber-900">
                              {(language === 'zh' ? '建议得分' : 'Suggested score')} {Math.round((deliberateErrorChallenge.score_hint.score || 0) * 100)}%
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {recentDeliberateErrorHistory.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <div className="text-sm font-semibold uppercase tracking-wide text-slate-900">
                          {language === 'zh' ? '最近的错误审计轨迹' : 'Recent Error-Audit Trail'}
                        </div>
                        <div className="mt-4 space-y-3">
                          {recentDeliberateErrorHistory.slice(-3).map((item) => (
                            <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                              <div className="text-xs font-medium text-slate-500">
                                {item.created_at ? new Date(item.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : ''}
                              </div>
                              <div className="mt-2 text-sm text-slate-900">
                                <span className="font-medium">{language === 'zh' ? '审计焦点：' : 'Audit focus:'}</span> {item.user_input}
                              </div>
                              <div className="mt-2 text-sm text-slate-600">
                                <span className="font-medium">{language === 'zh' ? '错误说法：' : 'Flawed claim:'}</span> {String(item.agent_output?.flawed_claim || '')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {simulationScenario && (
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <h3 className="text-lg font-semibold text-slate-900">{simulationScenario.title}</h3>
                        <p className="mt-2 text-sm text-slate-600">{simulationScenario.scenario}</p>
                        <div className="mt-4 space-y-2">
                          {simulationScenario.success_criteria?.map((criterion: string) => (
                            <div key={criterion} className="text-sm text-slate-700">• {criterion}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {language === 'zh' ? '实时应用模拟' : 'Live Applied Simulation'}
                      </h3>
                      <p className="mt-2 text-sm text-slate-600">
                        {language === 'zh'
                          ? '把这节课真正放进一个决策情境里。写下你的做法，系统会让环境“回击”你。'
                          : 'Put the lesson into a real decision context. Write your move, and the environment will push back.'}
                      </p>
                      <div className="mt-4 flex gap-3">
                        <input
                          type="text"
                          value={simulationInput}
                          onChange={(e) => setSimulationInput(e.target.value)}
                          placeholder={language === 'zh' ? '例如：我会先比较图像开口方向和顶点位置，再判断函数行为' : 'For example: I would compare the opening direction and vertex first, then decide how the function behaves'}
                          className="flex-1 rounded-lg border border-slate-300 px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          onClick={runSimulationTurn}
                          disabled={!isSignedIn || simulationLoading || !simulationInput.trim()}
                          className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {simulationLoading
                            ? (language === 'zh' ? '生成中...' : 'Generating...')
                            : (language === 'zh' ? '运行模拟' : 'Run Simulation')}
                        </button>
                      </div>
                      {!isSignedIn && (
                        <p className="mt-3 text-xs text-slate-500">
                          {language === 'zh'
                            ? '登录后即可使用实时模拟。'
                            : 'Sign in to use the live simulation.'}
                        </p>
                      )}
                    </div>

                    {simulationTurn && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                        <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                          {simulationTurn.counterparty_role}
                        </div>
                        <p className="mt-4 text-sm leading-7 text-emerald-950">{simulationTurn.counterparty_message}</p>
                        <div className="mt-4 rounded-lg bg-white/70 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                            {language === 'zh' ? '压力变化' : 'Pressure Shift'}
                          </div>
                          <p className="mt-2 text-sm text-emerald-950">{simulationTurn.pressure}</p>
                        </div>
                        <div className="mt-4 rounded-lg bg-white/70 p-4">
                          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                            {language === 'zh' ? '教练反馈' : 'Coach Feedback'}
                          </div>
                          <p className="mt-2 text-sm text-emerald-950">{simulationTurn.coach_feedback}</p>
                          <p className="mt-3 text-sm text-emerald-900">
                            <span className="font-medium">{language === 'zh' ? '下一步：' : 'Next move:'}</span> {simulationTurn.next_prompt}
                          </p>
                        </div>
                        {simulationTurn.score_hint && (
                          <div className="mt-4 flex flex-wrap gap-3">
                            <button
                              onClick={() => saveGeneratedAssessment('simulation', simulationTurn.score_hint)}
                              disabled={!isSignedIn || recordingAssessment === 'simulation'}
                              className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                            >
                              {recordingAssessment === 'simulation'
                                ? (language === 'zh' ? '保存中...' : 'Saving...')
                                : (language === 'zh' ? '保存这一轮表现' : 'Save This Round')}
                            </button>
                            <div className="text-xs text-emerald-900">
                              {(language === 'zh' ? '建议得分' : 'Suggested score')} {Math.round((simulationTurn.score_hint.score || 0) * 100)}%
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {recentSimulationHistory.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <div className="text-sm font-semibold uppercase tracking-wide text-slate-900">
                          {language === 'zh' ? '最近的应用轨迹' : 'Recent Application Trail'}
                        </div>
                        <div className="mt-4 space-y-3">
                          {recentSimulationHistory.slice(-3).map((item) => (
                            <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                              <div className="text-xs font-medium text-slate-500">
                                {item.created_at ? new Date(item.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : ''}
                              </div>
                              <div className="mt-2 text-sm text-slate-900">
                                <span className="font-medium">{language === 'zh' ? '你的做法：' : 'Your move:'}</span> {item.user_input}
                              </div>
                              <div className="mt-2 text-sm text-slate-600">
                                <span className="font-medium">{language === 'zh' ? '反馈：' : 'Feedback:'}</span> {String(item.agent_output?.coach_feedback || '')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {oralDefenseQuestions.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {lesson.process_layer?.oral_defense?.panel_title || (language === 'zh' ? '口头答辩' : 'Oral Defense')}
                        </h3>
                        <div className="mt-4 space-y-2">
                          {oralDefenseQuestions.map((question: string) => (
                            <div key={question} className="text-sm text-slate-700">• {question}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-white p-5">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {language === 'zh' ? '实时口头答辩' : 'Live Oral Defense'}
                      </h3>
                      <p className="mt-2 text-sm text-slate-600">
                        {language === 'zh'
                          ? '像在专家面前答辩一样，用你自己的语言解释原理、条件和边界。'
                          : 'Defend the idea in your own words, as if a panel of experts were probing your reasoning.'}
                      </p>
                      <div className="mt-4 space-y-3">
                        <textarea
                          value={oralDefenseInput}
                          onChange={(e) => setOralDefenseInput(e.target.value)}
                          placeholder={language === 'zh' ? '试着回答：为什么这个概念成立？它在什么条件下会失效？' : 'Try answering: why does the idea work, and under what conditions does it break down?'}
                          className="min-h-[120px] w-full rounded-lg border border-slate-300 px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          onClick={runOralDefenseTurn}
                          disabled={!isSignedIn || oralDefenseLoading || !oralDefenseInput.trim()}
                          className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          {oralDefenseLoading
                            ? (language === 'zh' ? '生成中...' : 'Generating...')
                            : (language === 'zh' ? '开始答辩' : 'Run Oral Defense')}
                        </button>
                      </div>
                      {!isSignedIn && (
                        <p className="mt-3 text-xs text-slate-500">
                          {language === 'zh'
                            ? '登录后即可使用实时口头答辩。'
                            : 'Sign in to use the live oral defense.'}
                        </p>
                      )}
                    </div>

                    {oralDefenseTurn && (
                      <div className="space-y-4">
                        <div className="grid md:grid-cols-3 gap-4">
                          {oralDefenseTurn.panel.map((item, index) => (
                            <div key={`${item.role}-${index}`} className="rounded-xl border border-violet-200 bg-violet-50 p-5">
                              <div className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-900">
                                {item.role}
                              </div>
                              <p className="mt-4 text-sm leading-7 text-violet-950">{item.message}</p>
                            </div>
                          ))}
                        </div>
                        <div className="rounded-xl border border-violet-200 bg-violet-50 p-5">
                          <div className="text-sm font-semibold uppercase tracking-wide text-violet-900">
                            {language === 'zh' ? '答辩结论' : 'Defense Verdict'}
                          </div>
                          <p className="mt-2 text-sm text-violet-950">{oralDefenseTurn.verdict}</p>
                          <div className="mt-4 text-sm font-medium text-violet-950">
                            {language === 'zh' ? '下一问：' : 'Next question:'}
                          </div>
                          <p className="mt-1 text-sm text-violet-900">{oralDefenseTurn.next_question}</p>
                          {oralDefenseTurn.score_hint && (
                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                onClick={() => saveGeneratedAssessment('oral_defense', oralDefenseTurn.score_hint)}
                                disabled={!isSignedIn || recordingAssessment === 'oral_defense'}
                                className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
                              >
                                {recordingAssessment === 'oral_defense'
                                  ? (language === 'zh' ? '保存中...' : 'Saving...')
                                  : (language === 'zh' ? '保存这一轮表现' : 'Save This Round')}
                              </button>
                              <div className="text-xs text-violet-900">
                                {(language === 'zh' ? '建议得分' : 'Suggested score')} {Math.round((oralDefenseTurn.score_hint.score || 0) * 100)}%
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {recentOralDefenseHistory.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-white p-5">
                        <div className="text-sm font-semibold uppercase tracking-wide text-slate-900">
                          {language === 'zh' ? '最近的答辩轨迹' : 'Recent Defense Trail'}
                        </div>
                        <div className="mt-4 space-y-3">
                          {recentOralDefenseHistory.slice(-3).map((item) => (
                            <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                              <div className="text-xs font-medium text-slate-500">
                                {item.created_at ? new Date(item.created_at).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US') : ''}
                              </div>
                              <div className="mt-2 text-sm text-slate-900">
                                <span className="font-medium">{language === 'zh' ? '你的回答：' : 'Your answer:'}</span> {item.user_input}
                              </div>
                              <div className="mt-2 text-sm text-slate-600">
                                <span className="font-medium">{language === 'zh' ? '结论：' : 'Verdict:'}</span> {String(item.agent_output?.verdict || '')}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {practiceMissions.map((mission) => (
                      <div key={mission.id} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">{mission.title}</h3>
                            <p className="mt-2 text-sm text-slate-600">{mission.description}</p>
                          </div>
                          <div className="text-xs text-slate-500">
                            {lessonState?.next_review?.metadata?.trigger || (language === 'zh' ? '过程优先' : 'Process-first')}
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            onClick={() => recordPerformance(
                              mission.id,
                              mission.strong.score,
                              mission.strong.confidence,
                              mission.strong.reflection,
                              mission.strong.strengths,
                              mission.strong.struggles,
                            )}
                            disabled={!isSignedIn || recordingAssessment === mission.id}
                            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {mission.strong.label}
                          </button>
                          <button
                            onClick={() => recordPerformance(
                              mission.id,
                              mission.weak.score,
                              mission.weak.confidence,
                              mission.weak.reflection,
                              mission.weak.strengths,
                              mission.weak.struggles,
                            )}
                            disabled={!isSignedIn || recordingAssessment === mission.id}
                            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-700 border border-slate-300 hover:border-slate-400 disabled:opacity-50"
                          >
                            {mission.weak.label}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'content' && (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                      <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        {language === 'zh' ? '课程概览' : 'Lesson Overview'}
                      </div>
                      <p className="mt-3 text-sm leading-7 text-slate-700">
                        {clearLessonPlan?.overview || lesson.description}
                      </p>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold mb-4">{t('lessonDetail.learningObjectives')}</h3>
                      <ul className="list-disc pl-5 mb-6 space-y-2">
                        {lesson.objectives?.length
                          ? lesson.objectives.map((obj: any, i: number) => (
                              <li key={i} className="text-gray-700">{obj.objective}</li>
                            ))
                          : (clearLessonPlan?.learning_objectives || []).map((obj: string, i: number) => (
                              <li key={i} className="text-gray-700">{obj}</li>
                            ))}
                      </ul>
                    </div>

                    {Array.isArray(clearLessonPlan?.prerequisites) && clearLessonPlan.prerequisites.length > 0 && (
                      <div>
                        <h3 className="text-lg font-bold mb-4">{language === 'zh' ? '先修知识' : 'Prerequisites'}</h3>
                        <div className="flex flex-wrap gap-2">
                          {clearLessonPlan.prerequisites.map((item: string) => (
                            <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-lg font-bold mb-4">{language === 'zh' ? '课程流程' : 'Lesson Flow'}</h3>
                      <div className="space-y-4">
                        {lessonChapters.map((chapter: any, index: number) => (
                          <div key={chapter.id || `${chapter.title}-${index}`} className="rounded-xl border border-slate-200 bg-white p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {language === 'zh' ? `部分 ${index + 1}` : `Part ${index + 1}`}
                                </div>
                                <h4 className="mt-1 text-base font-semibold text-slate-900">
                                  {chapter.title || chapter.learning_goal || chapter.id}
                                </h4>
                              </div>
                              {chapter.duration_minutes && (
                                <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
                                  {chapter.duration_minutes} {t('common.minutes')}
                                </div>
                              )}
                            </div>
                            <p className="mt-3 text-sm leading-7 text-slate-700">
                              {chapter.summary || chapter.learning_goal || chapter.content || ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {Array.isArray(clearLessonPlan?.practice) && clearLessonPlan.practice.length > 0 && (
                      <div>
                        <h3 className="text-lg font-bold mb-4">{language === 'zh' ? '练习与应用' : 'Practice and Application'}</h3>
                        <div className="space-y-2">
                          {clearLessonPlan.practice.map((item: string) => (
                            <div key={item} className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                              • {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'script' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                      <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        {language === 'zh' ? '完整讲稿 / Transcript' : 'Full Transcript'}
                      </div>
                      <div className="mt-3 bg-white p-4 rounded-lg border border-gray-200 font-mono text-sm leading-relaxed text-gray-700 whitespace-pre-wrap max-h-[420px] overflow-y-auto">
                        {transcriptText || t('lessonDetail.noScript')}
                      </div>
                    </div>

                    {sceneScript.length > 0 && (
                      <div className="space-y-3">
                        {sceneScript.map((scene: any, index: number) => (
                          <div key={scene.id || index} className="rounded-xl border border-slate-200 bg-white p-5">
                            <div className="flex items-center justify-between gap-4">
                              <div className="text-sm font-semibold text-slate-900">
                                {language === 'zh' ? `场景 ${index + 1}` : `Scene ${index + 1}`}
                              </div>
                              <div className="text-xs font-medium text-slate-500">
                                {Math.round(scene.duration || 0)}s • {scene.action}
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <div className="rounded-lg bg-slate-50 p-4">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  {language === 'zh' ? '画面内容' : 'On Screen'}
                                </div>
                                <p className="mt-2 text-sm text-slate-700">{scene.on_screen_text || '—'}</p>
                              </div>
                              <div className="rounded-lg bg-blue-50 p-4">
                                <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                                  {language === 'zh' ? '旁白' : 'Narration'}
                                </div>
                                <p className="mt-2 text-sm text-blue-900">{scene.narration || '—'}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'video' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100">
                      <div>
                        <h4 className="font-semibold text-blue-900">{t('lessonDetail.aiTeacherConfidence')}</h4>
                        <p className="text-sm text-blue-700">{t('lessonDetail.basedOnTopicAnalysis')}</p>
                      </div>
                      <div className="text-2xl font-bold text-blue-800">{((lesson.ai_insights?.confidence || 0.8) * 100).toFixed(0)}%</div>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">{t('lessonDetail.pedagogicalApproach')}</h4>
                      <p className="text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-200">
                        {lesson.teaching_methodology || "Standard AI Instruction"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('lessonDetail.yourProgress')}</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">{t('lessonDetail.completion')}</span>
                    <span className="font-medium text-gray-900">{Math.round(completion)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${completion}%` }}></div>
                  </div>
                </div>
                <button
                  onClick={() => updateLessonProgress(100, true)}
                  disabled={!isSignedIn || savingProgress}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {savingProgress
                    ? (language === 'zh' ? '保存中...' : 'Saving...')
                    : t('lessonDetail.markComplete')}
                </button>
                {!isSignedIn && (
                  <p className="text-xs text-gray-500">
                    {language === 'zh'
                      ? '登录后即可保存进度并自动安排遗忘曲线复习。'
                      : 'Sign in to save progress and automatically schedule forgetting-curve reviews.'}
                  </p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {language === 'zh' ? '记忆曲线状态' : 'Forgetting Curve Status'}
              </h3>
              {lessonState?.next_review ? (
                <div className="space-y-3">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                    <div className="text-sm font-semibold text-amber-900">
                      {language === 'zh' ? '下次最佳复习时间' : 'Next Best Review Time'}
                    </div>
                    <div className="mt-1 text-sm text-amber-800">{nextReviewDate}</div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {language === 'zh'
                      ? `当前复习间隔约为 ${Math.round(lessonState.next_review.interval_hours)} 小时。`
                      : `Current review interval is about ${Math.round(lessonState.next_review.interval_hours)} hours.`}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  {language === 'zh'
                    ? '完成本课或提交一次练习反思后，这里会出现下一次最佳复习时机。'
                    : 'Complete the lesson or submit one practice reflection and the next best review window will appear here.'}
                </p>
              )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('lessonDetail.resources')}</h3>
              <ul className="space-y-3">
                {lesson.resources?.map((res: any, i: number) => {
                  const isString = typeof res === 'string';
                  const displayText = isString ? res : (res.title || res.description || res.name || t('lessonDetail.externalResource'));
                  const url = isString ? '#' : (res.url || '#');

                  return (
                    <li key={i} className="flex items-start">
                      <svg className="w-5 h-5 text-gray-400 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <a href={url} target={url !== '#' ? "_blank" : "_self"} rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                        {displayText}
                      </a>
                    </li>
                  );
                }) || <li className="text-sm text-gray-500">{t('lessonDetail.noExternalResources')}</li>}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
