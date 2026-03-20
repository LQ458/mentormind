'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '@clerk/nextjs'

interface SystemStatus {
  status: string
  version: string
  services?: {
    deepseek?: string
    funasr?: string
    paddle_ocr?: string
    tts?: string
    ai_lessons?: string
    speech_recognition?: string
    text_extraction?: string
    video_generation?: string
  }
  cost_analysis?: {
    monthly_budget: number
    current_month: number
    remaining: number
  }
  subscription?: {
    plan: string
    monthly_cost: number
    lessons_included: number
    lessons_used: number
    lessons_remaining: number
    cost_this_month: number
    renewal_date: string
  }
  configuration?: any
  language_support?: any
  error?: string
}

interface ReviewQueueItem {
  id: number
  review_type: string
  stage: 'due_now' | 'upcoming'
  due_in_hours: number
  due_at: string
  lesson: {
    id: string
    title: string
    topic: string
    duration_minutes: number
    video_url?: string | null
  }
  metadata?: {
    trigger?: string
    mastery?: number
  }
}

export default function DashboardPage() {
  const { language, t } = useLanguage()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentLessons, setRecentLessons] = useState<any[]>([])
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([])

  useEffect(() => {
    fetchStatus()
    fetchRecentLessons()
    fetchReviewQueue()
  }, [isLoaded, isSignedIn])

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/backend')
      const data = await response.json()
      setStatus(data)
    } catch (error) {
      console.error('Failed to fetch status:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchRecentLessons = async () => {
    try {
      const endpoint = isSignedIn ? '/api/backend/users/me/lessons' : '/api/backend/results';
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const response = await fetch(endpoint, {
        headers
      })
      const data = await response.json()
      // /users/me/lessons returns an array directly, /results returns { results: [] }
      const rawLessons = Array.isArray(data) ? data : (data.results || [])
      const normalized = rawLessons.map((lesson: any) => ({
        id: lesson.id,
        timestamp: lesson.timestamp || lesson.created_at,
        query: lesson.query || lesson.topic,
        lesson_title: lesson.lesson_title || lesson.title,
        quality_score: lesson.quality_score || 0,
        cost_usd: lesson.cost_usd || 0,
      }))
      setRecentLessons(normalized)
    } catch (error) {
      console.error('Failed to fetch lessons:', error)
    }
  }

  const fetchReviewQueue = async () => {
    if (!isLoaded || !isSignedIn) {
      setReviewQueue([])
      return
    }

    try {
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch('/api/backend/users/me/review-queue', { headers })
      if (!response.ok) {
        throw new Error(`Failed to fetch review queue: ${response.status}`)
      }

      const data = await response.json()
      setReviewQueue(data.items || [])
    } catch (error) {
      console.error('Failed to fetch review queue:', error)
      setReviewQueue([])
    }
  }

  const formatReviewTiming = (item: ReviewQueueItem) => {
    if (item.stage === 'due_now') {
      return language === 'zh' ? '现在最适合复习' : 'Best reviewed now'
    }

    if (item.due_in_hours < 24) {
      return language === 'zh'
        ? `${Math.max(1, Math.round(item.due_in_hours))} 小时后进入遗忘风险`
        : `Memory risk rises in ${Math.max(1, Math.round(item.due_in_hours))}h`
    }

    return language === 'zh'
      ? `${Math.round(item.due_in_hours / 24)} 天后建议复习`
      : `Suggested review in ${Math.round(item.due_in_hours / 24)}d`
  }

  if (!isLoaded || loading || !status) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">{t('common.loading')}</div>
      </div>
    )
  }

  const lessonsUsed = status.subscription?.lessons_used || 0
  const lessonsIncluded = status.subscription?.lessons_included || 1000
  const usedPct = ((lessonsUsed / lessonsIncluded) * 100).toFixed(1)
  const costThisMonth = status.subscription?.cost_this_month || 0
  const monthlyBudget = status.subscription?.monthly_cost || 29.99
  const budgetPct = ((costThisMonth / monthlyBudget) * 100).toFixed(1)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('dashboard.pageTitle')}</h1>
          <p className="text-gray-600 mt-1">{t('dashboard.pageSubtitle')}</p>
        </div>
        <div className="text-sm text-gray-500">
          {t('dashboard.lastUpdated')}: {new Date().toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US')}
        </div>
      </div>

      {/* Quick Actions + System Status */}
      {isSignedIn && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {language === 'zh' ? '今天的主动干预' : 'Today\'s Proactive Interventions'}
              </h2>
              <p className="text-sm text-gray-600 mt-1 max-w-2xl">
                {language === 'zh'
                  ? 'MentorMind 会基于间隔重复、检索练习和适度认知摩擦，在最容易遗忘的时刻提醒你复习。'
                  : 'MentorMind uses spaced repetition, retrieval practice, and productive friction to surface the right review at the right time.'}
              </p>
            </div>
            <Link href="/principles" className="text-sm font-medium text-blue-600 hover:text-blue-800">
              {language === 'zh' ? '查看设计原则' : 'See Design Principles'}
            </Link>
          </div>

          <div className="mt-6 grid md:grid-cols-3 gap-4">
            {reviewQueue.length > 0 ? reviewQueue.slice(0, 3).map((item) => (
              <Link
                key={item.id}
                href={`/lessons/${item.lesson.id}`}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${item.stage === 'due_now' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>
                    {item.stage === 'due_now'
                      ? (language === 'zh' ? '立即复习' : 'Review Now')
                      : (language === 'zh' ? '即将遗忘' : 'Upcoming')}
                  </span>
                  <span className="text-xs text-gray-500">
                    {item.metadata?.trigger || item.review_type}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-gray-900 line-clamp-2">
                  {item.lesson.title}
                </h3>
                <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                  {formatReviewTiming(item)}
                </p>
                <div className="mt-4 text-sm font-medium text-blue-600">
                  {language === 'zh' ? '进入 3 分钟挑战' : 'Open 3-minute challenge'}
                </div>
              </Link>
            )) : (
              <div className="md:col-span-3 rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center">
                <p className="text-sm text-gray-600">
                  {language === 'zh'
                    ? '完成一节课程后，这里会自动出现基于遗忘曲线的复习挑战。'
                    : 'Finish a lesson and this queue will start surfacing forgetting-curve-based review challenges automatically.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('dashboard.quickActions')}</h2>
          <div className="space-y-4">
            <a
              href="/create"
              className="block w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors text-center"
            >
              {t('dashboard.createNewLesson')}
            </a>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="/lessons"
                className="bg-gray-100 text-gray-700 px-4 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors text-center"
              >
                {t('dashboard.viewAllLessons')}
              </a>
              <a
                href="/analytics"
                className="bg-gray-100 text-gray-700 px-4 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors text-center"
              >
                {t('dashboard.viewAnalytics')}
              </a>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('dashboard.systemStatus')}</h2>
          <div className="space-y-3">
            {status && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">{t('dashboard.backendService')}</span>
                  <span className={`px-2 py-1 rounded text-sm font-medium ${status.status === 'running' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {status.status === 'running' ? t('dashboard.online') : t('dashboard.offline')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">{t('dashboard.aiLessons')}</span>
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-sm font-medium rounded">
                    {status.services?.deepseek === 'configured' || status.services?.ai_lessons === 'active'
                      ? t('dashboard.normal')
                      : t('dashboard.maintenance')}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">{t('dashboard.lessonsUsedLabel')}</span>
                  <span className="font-medium">{lessonsUsed} / {lessonsIncluded}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">{t('dashboard.monthlyCostLabel')}</span>
                  <span className="font-medium">${monthlyBudget.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">{t('dashboard.renewalDateLabel')}</span>
                  <span className="font-medium">
                    {status.subscription?.renewal_date
                      ? new Date(status.subscription.renewal_date).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')
                      : 'N/A'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recent Lessons */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">{t('dashboard.recentLessons')}</h2>
          <Link href="/lessons" className="text-blue-600 hover:text-blue-800 font-medium text-sm">
            {t('dashboard.viewAll')}
          </Link>
        </div>

        {recentLessons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.timeHeader')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.studentQueryHeader')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.lessonTitleHeader')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.qualityHeader')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.costHeader')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentLessons.map((lesson) => (
                  <tr key={lesson.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {new Date(lesson.timestamp).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{lesson.query}</td>
                    <td className="px-4 py-3 text-sm font-medium text-blue-600">
                      <Link href={`/lessons/${lesson.id}`} className="hover:underline">{lesson.lesson_title}</Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${lesson.quality_score >= 0.8 ? 'bg-green-100 text-green-800' : lesson.quality_score >= 0.6 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                        {(lesson.quality_score * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">${lesson.cost_usd?.toFixed(4) || '0.0000'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>{t('dashboard.noLessonsYet')}</p>
            <p className="text-sm mt-2">{t('dashboard.noLessonsHint')}</p>
          </div>
        )}
      </div>

      {/* Subscription Usage */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">{t('dashboard.subscriptionUsage')}</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-blue-50 rounded-lg p-6">
            <div className="text-sm text-blue-700 mb-2">{t('dashboard.currentPlan')}</div>
            <div className="text-2xl font-bold text-blue-900 mb-2">{t('dashboard.proName')}</div>
            <div className="text-sm text-blue-600">{t('dashboard.proPrice')}</div>
          </div>

          <div className="bg-green-50 rounded-lg p-6">
            <div className="text-sm text-green-700 mb-2">{t('dashboard.thisMonthLessons')}</div>
            <div className="text-2xl font-bold text-green-900 mb-2">{lessonsUsed} / {lessonsIncluded}</div>
            <div className="text-sm text-green-600">{t('dashboard.usedPercent', { pct: usedPct })}</div>
            <div className="mt-4">
              <div className="text-xs text-green-700 mb-1">{t('dashboard.remainingLessons', { n: lessonsIncluded - lessonsUsed })}</div>
              <div className="w-full bg-green-100 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(parseFloat(usedPct), 100)}%` }}></div>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-6">
            <div className="text-sm text-purple-700 mb-2">{t('dashboard.costEfficiency')}</div>
            <div className="text-2xl font-bold text-purple-900 mb-2">${costThisMonth.toFixed(2)}</div>
            <div className="text-sm text-purple-600">{t('dashboard.usedThisMonth')}</div>
            <div className="mt-4">
              <div className="text-xs text-purple-700 mb-1">{t('dashboard.percentOfBudget', { pct: budgetPct })}</div>
              <div className="w-full bg-purple-100 rounded-full h-2">
                <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${Math.min(parseFloat(budgetPct), 100)}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-medium text-gray-900">{t('dashboard.needMore')}</div>
              <div className="text-sm text-gray-500 mt-1">{t('dashboard.upgradeDesc')}</div>
            </div>
            <a
              href="/settings#subscription"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              {t('dashboard.upgradePlan')}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
