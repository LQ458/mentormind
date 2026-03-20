'use client'

import { useEffect, useMemo, useState } from 'react'
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
      const response = await fetch(`/api/backend/lessons/${id}`)
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

  const toProxyUrl = (rawPath: string | null): string | null => {
    if (!rawPath) return null
    if (rawPath.startsWith('http')) return rawPath
    const cleanPath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath
    return `/api/backend/media/${cleanPath}`
  }

  const seminarCards = useMemo(() => {
    if (!lesson) return []
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
                  </div>
                )}

                {activeTab === 'practice' && (
                  <div className="space-y-4">
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
                  <div className="prose max-w-none">
                    <h3 className="text-lg font-bold mb-4">{t('lessonDetail.learningObjectives')}</h3>
                    <ul className="list-disc pl-5 mb-6 space-y-2">
                      {lesson.objectives?.map((obj: any, i: number) => (
                        <li key={i} className="text-gray-700">{obj.objective}</li>
                      )) || <li>{t('lessonDetail.noObjectives')}</li>}
                    </ul>

                    <h3 className="text-lg font-bold mb-4">{t('lessonDetail.coreConcepts')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {Object.entries(lesson.ai_insights?.lesson_plan || {}).map(([key, value]: [string, any]) => (
                        <div key={key} className="bg-gray-50 p-4 rounded-lg">
                          <span className="font-semibold capitalize text-gray-700 block mb-1">{key}</span>
                          <span className="text-sm text-gray-600">{String(value).slice(0, 100)}...</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'script' && (
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 font-mono text-sm leading-relaxed text-gray-700 whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                      {lesson.ai_insights?.script?.script_text || t('lessonDetail.noScript')}
                    </div>
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
