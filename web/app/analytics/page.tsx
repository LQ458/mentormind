'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLanguage } from '../components/LanguageContext'

interface AnalyticsData {
  total_lessons: number
  total_cost: number
  avg_quality: number
  lessons_by_day: Array<{ date: string; count: number; cost: number }>
  service_usage: {
    deepseek: number
    funasr: number
    paddle_ocr: number
    tts: number
  }
}

export default function AnalyticsPage() {
  const { language: uiLanguage, t } = useLanguage()
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('7d')

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange])

  const fetchAnalytics = async () => {
    try {
      // In a real implementation, this would fetch from /api/analytics
      // For now, we'll generate mock data
      const mockData: AnalyticsData = {
        total_lessons: 42,
        total_cost: 3.42,
        avg_quality: 0.82,
        lessons_by_day: [
          { date: '2026-01-17', count: 5, cost: 0.38 },
          { date: '2026-01-18', count: 8, cost: 0.62 },
          { date: '2026-01-19', count: 6, cost: 0.45 },
          { date: '2026-01-20', count: 7, cost: 0.52 },
          { date: '2026-01-21', count: 9, cost: 0.68 },
          { date: '2026-01-22', count: 4, cost: 0.31 },
          { date: '2026-01-23', count: 3, cost: 0.24 },
        ],
        service_usage: {
          deepseek: 85,
          funasr: 10,
          paddle_ocr: 3,
          tts: 2,
        }
      }
      setAnalytics(mockData)
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
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

  if (!analytics) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {t('analytics.noAnalyticsData')}
        </h3>
        <p className="text-gray-500">
          {t('analytics.noAnalyticsDescription')}
        </p>
      </div>
    )
  }

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


        <div className="text-sm text-gray-500">
          {t('analytics.timeRangeLabel')}:
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {['1d', '7d', '30d', '90d'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${timeRange === range
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              {t(`analytics.timeRangeOptions.${range}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">
            {t('analytics.totalLessons')}
          </div>
          <div className="text-3xl font-bold text-gray-900">{analytics.total_lessons}</div>
          <div className="text-sm text-green-600 mt-2">+12% from last period</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">
            {t('analytics.totalCost')}
          </div>
          <div className="text-3xl font-bold text-gray-900">${analytics.total_cost.toFixed(2)}</div>
          <div className="text-sm text-blue-600 mt-2">${(160 - analytics.total_cost).toFixed(2)} {t('analytics.remaining')}</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">
            {t('analytics.avgQuality')}
          </div>
          <div className="text-3xl font-bold text-gray-900">{(analytics.avg_quality * 100).toFixed(0)}%</div>
          <div className="text-sm text-green-600 mt-2">
            {t('analytics.excellentQuality')}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">
            {t('analytics.dailyAvg')}
          </div>
          <div className="text-3xl font-bold text-gray-900">{Math.round(analytics.total_lessons / 7)}</div>
          <div className="text-sm text-gray-600 mt-2">
            {t('analytics.lessonsPerDay')}
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
          <div className="space-y-4">
            {analytics.lessons_by_day.map((day) => (
              <div key={day.date} className="flex items-center">
                <div className="w-24 text-sm text-gray-500">
                  {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="w-full bg-gray-100 rounded-full h-4">
                      <div
                        className="bg-blue-500 h-4 rounded-full"
                        style={{ width: `${(day.count / 10) * 100}%` }}
                      />
                    </div>
                    <div className="ml-4 text-sm font-medium text-gray-900 w-12 text-right">
                      {day.count}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Cost: ${day.cost.toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Service Usage */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {t('analytics.serviceUsageDistribution')}
          </h2>
          <div className="space-y-4">
            {Object.entries(analytics.service_usage).map(([service, percentage]) => (
              <div key={service} className="flex items-center">
                <div className="w-32 text-sm text-gray-500">
                  {t(`analytics.${service}`)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="w-full bg-gray-100 rounded-full h-4">
                      <div
                        className={`h-4 rounded-full ${service === 'deepseek' ? 'bg-blue-500' :
                          service === 'funasr' ? 'bg-green-500' :
                            service === 'paddle_ocr' ? 'bg-purple-500' :
                              'bg-yellow-500'
                          }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="ml-4 text-sm font-medium text-gray-900 w-12 text-right">
                      {percentage}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Subscription Value */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t('analytics.subscriptionValueAnalysis')}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm text-blue-700 mb-1">
              {t('analytics.monthlyCost')}
            </div>
            <div className="text-2xl font-bold text-blue-900">$29.99</div>
            <div className="text-xs text-blue-600 mt-1">
              {t('analytics.professionalPlan')}
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-sm text-green-700 mb-1">
              {t('analytics.costPerLesson')}
            </div>
            <div className="text-2xl font-bold text-green-900">${(29.99 / 1000).toFixed(3)}</div>
            <div className="text-xs text-green-600 mt-1">
              {t('analytics.basedOnUsage')}
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-sm text-purple-700 mb-1">
              {t('analytics.yourCostPerLesson')}
            </div>
            <div className="text-2xl font-bold text-purple-900">${(analytics.total_cost / analytics.total_lessons).toFixed(3)}</div>
            <div className="text-xs text-purple-600 mt-1">
              {t('analytics.actualUsage')}
            </div>
          </div>

          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="text-sm text-yellow-700 mb-1">
              {t('analytics.savings')}
            </div>
            <div className="text-2xl font-bold text-yellow-900">${(29.99 - analytics.total_cost).toFixed(2)}</div>
            <div className="text-xs text-yellow-600 mt-1">
              {t('analytics.thisMonth')}
            </div>
          </div>
        </div>
      </div>

      {/* Quality Metrics */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t('analytics.qualityMetrics')}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">92%</div>
            <div className="text-sm text-gray-500 mt-1">
              {t('analytics.clarity')}
            </div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">88%</div>
            <div className="text-sm text-gray-500 mt-1">
              {t('analytics.completeness')}
            </div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">85%</div>
            <div className="text-sm text-gray-500 mt-1">
              {t('analytics.engagement')}
            </div>
          </div>

          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-600">90%</div>
            <div className="text-sm text-gray-500 mt-1">
              {t('analytics.practicality')}
            </div>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-3">
          {t('analytics.recommendationsTitle')}
        </h2>
        <div className="space-y-3">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-blue-800 font-medium">
                {t('analytics.costEfficiency')}
              </p>
              <p className="text-blue-700 text-sm mt-1">
                {t('analytics.costEfficiencyDetail')}
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-blue-800 font-medium">
                {t('analytics.increaseLessonComplexity')}
              </p>
              <p className="text-blue-700 text-sm mt-1">
                {t('analytics.increaseLessonComplexityDetail')}
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-blue-800 font-medium">
                {t('analytics.peakUsage')}
              </p>
              <p className="text-blue-700 text-sm mt-1">
                {t('analytics.peakUsageDetail')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div >
  )
}