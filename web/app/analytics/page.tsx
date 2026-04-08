'use client'

import { useState, useEffect } from 'react'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '@clerk/nextjs'

interface AnalyticsData {
  total_lessons: number
  completed_lessons: number
  avg_watch_percentage: number
  high_engagement_lessons: number
  quiz_completion_rate: number
  avg_score: number
  review_completion_rate: number
  lessons_by_day: Array<{ date: string; count: number }>
}

export default function AnalyticsPage() {
  const { language: uiLanguage, t } = useLanguage()
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    fetchAnalytics()
  }, [isLoaded, isSignedIn])

  const fetchAnalytics = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = isSignedIn ? await getToken() : null
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetch('/api/backend/users/me/analytics', { headers })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.success) {
        setAnalytics(data)
      } else {
        throw new Error('Analytics endpoint returned an error')
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
      setError(uiLanguage === 'zh' ? '无法加载分析数据' : 'Could not load analytics data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">{t('analytics.loading')}</div>
      </div>
    )
  }

  if (error || !analytics) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {error || t('analytics.noAnalyticsData')}
        </h3>
        <p className="text-gray-500 mb-4">{t('analytics.noAnalyticsDescription')}</p>
        <button
          onClick={fetchAnalytics}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          {uiLanguage === 'zh' ? '重试' : 'Retry'}
        </button>
      </div>
    )
  }

  const maxDayCount = Math.max(...analytics.lessons_by_day.map(d => d.count), 1)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {t('analytics.pageTitle')}
          </h1>
          <p className="text-gray-600 mt-1">
            {t('analytics.pageDescription')}
          </p>
        </div>
        <button
          onClick={fetchAnalytics}
          className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
        >
          {uiLanguage === 'zh' ? '刷新' : 'Refresh'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">{t('analytics.totalLessons')}</div>
          <div className="text-3xl font-bold text-gray-900">{analytics.total_lessons}</div>
          <div className="text-sm text-blue-600 mt-2">
            {analytics.completed_lessons} {uiLanguage === 'zh' ? '已完成' : 'completed'}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">
            {uiLanguage === 'zh' ? '平均观看进度' : 'Avg Watch Progress'}
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {analytics.avg_watch_percentage.toFixed(0)}%
          </div>
          <div className="text-sm text-green-600 mt-2">
            {analytics.high_engagement_lessons} {uiLanguage === 'zh' ? '深度观看 (≥80%)' : 'high-engagement (≥80%)'}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">
            {uiLanguage === 'zh' ? '测验完成率' : 'Quiz Completion Rate'}
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {analytics.quiz_completion_rate.toFixed(0)}%
          </div>
          <div className="text-sm text-purple-600 mt-2">
            {uiLanguage === 'zh' ? '跨完成课程' : 'across completed lessons'}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">
            {uiLanguage === 'zh' ? '平均得分' : 'Avg Assessment Score'}
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {analytics.avg_score.toFixed(0)}%
          </div>
          <div className="text-sm text-yellow-600 mt-2">
            {uiLanguage === 'zh' ? '复习完成率' : 'Review completion'}: {analytics.review_completion_rate.toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Daily Lessons Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {t('analytics.dailyLessonVolume')}
          </h2>
          {analytics.lessons_by_day.length === 0 ? (
            <p className="text-gray-400 text-sm py-6 text-center">
              {uiLanguage === 'zh' ? '过去 7 天暂无数据' : 'No activity in the last 7 days'}
            </p>
          ) : (
            <div className="space-y-4">
              {analytics.lessons_by_day.map((day) => (
                <div key={day.date} className="flex items-center">
                  <div className="w-24 text-sm text-gray-500">
                    {new Date(day.date).toLocaleDateString(uiLanguage === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center">
                      <div className="w-full bg-gray-100 rounded-full h-4">
                        <div
                          className="bg-blue-500 h-4 rounded-full transition-all"
                          style={{ width: `${(day.count / maxDayCount) * 100}%` }}
                        />
                      </div>
                      <div className="ml-4 text-sm font-medium text-gray-900 w-8 text-right">
                        {day.count}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Engagement Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {uiLanguage === 'zh' ? '学习参与度详情' : 'Engagement Breakdown'}
          </h2>
          <div className="space-y-5">
            {[
              {
                label: uiLanguage === 'zh' ? '平均观看进度' : 'Avg Watch Progress',
                value: analytics.avg_watch_percentage,
                color: 'bg-blue-500',
                suffix: '%',
              },
              {
                label: uiLanguage === 'zh' ? '测验完成率' : 'Quiz Completion',
                value: analytics.quiz_completion_rate,
                color: 'bg-purple-500',
                suffix: '%',
              },
              {
                label: uiLanguage === 'zh' ? '平均得分' : 'Avg Assessment Score',
                value: analytics.avg_score,
                color: 'bg-green-500',
                suffix: '%',
              },
              {
                label: uiLanguage === 'zh' ? '复习完成率' : 'Review Completion',
                value: analytics.review_completion_rate,
                color: 'bg-yellow-500',
                suffix: '%',
              },
            ].map((metric) => (
              <div key={metric.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{metric.label}</span>
                  <span className="font-semibold text-gray-900">{metric.value.toFixed(0)}{metric.suffix}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className={`${metric.color} h-2.5 rounded-full transition-all`}
                    style={{ width: `${Math.min(metric.value, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Insight Banner */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-3">
          {t('analytics.recommendationsTitle')}
        </h2>
        <div className="space-y-3">
          {analytics.avg_watch_percentage < 60 && (
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-blue-800 text-sm">
                {uiLanguage === 'zh'
                  ? `你的平均观看进度是 ${analytics.avg_watch_percentage.toFixed(0)}%。尝试生成更短的专题课程来提升完整观看率。`
                  : `Your average watch progress is ${analytics.avg_watch_percentage.toFixed(0)}%. Try generating shorter topic-focused lessons to improve completion.`}
              </p>
            </div>
          )}
          {analytics.quiz_completion_rate < 50 && (
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-blue-800 text-sm">
                {uiLanguage === 'zh'
                  ? '尝试在每节课后完成记忆挑战或口头答辩，这会显著提升长期记忆保留率。'
                  : 'Try completing a Memory Challenge or Oral Defense after each lesson — this significantly boosts long-term retention.'}
              </p>
            </div>
          )}
          {analytics.total_lessons === 0 && (
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <p className="text-blue-800 text-sm">
                {uiLanguage === 'zh'
                  ? '你还没有生成任何课程。前往「生成课程」开始你的第一节 AI 课程吧！'
                  : 'You have not generated any lessons yet. Head to Create to start your first AI-powered lesson!'}
              </p>
            </div>
          )}
          {analytics.avg_score >= 80 && analytics.total_lessons > 0 && (
            <div className="flex items-start">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              <p className="text-blue-800 text-sm">
                {uiLanguage === 'zh'
                  ? `你的平均得分是 ${analytics.avg_score.toFixed(0)}%，表现优秀！考虑挑战更高难度的主题以继续进步。`
                  : `Your average score is ${analytics.avg_score.toFixed(0)}% — excellent! Consider challenging yourself with more advanced topics to keep growing.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}