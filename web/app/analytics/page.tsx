'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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
        <div className="text-gray-500">Loading analytics...</div>
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
        <h3 className="text-lg font-medium text-gray-900 mb-2">No analytics data</h3>
        <p className="text-gray-500">Generate some lessons to see analytics</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Usage statistics and cost analysis</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            Time range:
          </div>
          <div className="flex bg-gray-100 rounded-lg p-1">
            {['1d', '7d', '30d', '90d'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  timeRange === range
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">Total Lessons</div>
          <div className="text-3xl font-bold text-gray-900">{analytics.total_lessons}</div>
          <div className="text-sm text-green-600 mt-2">+12% from last period</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">Total Cost</div>
          <div className="text-3xl font-bold text-gray-900">${analytics.total_cost.toFixed(2)}</div>
          <div className="text-sm text-blue-600 mt-2">${(160 - analytics.total_cost).toFixed(2)} remaining</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">Avg Quality</div>
          <div className="text-3xl font-bold text-gray-900">{(analytics.avg_quality * 100).toFixed(0)}%</div>
          <div className="text-sm text-green-600 mt-2">Excellent quality</div>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">Daily Avg</div>
          <div className="text-3xl font-bold text-gray-900">{Math.round(analytics.total_lessons / 7)}</div>
          <div className="text-sm text-gray-600 mt-2">lessons per day</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Daily Lessons Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Daily Lesson Volume</h2>
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Service Usage Distribution</h2>
          <div className="space-y-4">
            {Object.entries(analytics.service_usage).map(([service, percentage]) => (
              <div key={service} className="flex items-center">
                <div className="w-32 text-sm text-gray-500 capitalize">
                  {service.replace(/_/g, ' ')}
                </div>
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="w-full bg-gray-100 rounded-full h-4">
                      <div 
                        className={`h-4 rounded-full ${
                          service === 'deepseek' ? 'bg-blue-500' :
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
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Subscription Value Analysis</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-blue-700 mb-1">Monthly Cost</div>
              <div className="text-2xl font-bold text-blue-900">$29.99</div>
              <div className="text-xs text-blue-600 mt-1">Professional Plan</div>
            </div>
            
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-green-700 mb-1">Cost Per Lesson</div>
              <div className="text-2xl font-bold text-green-900">${(29.99 / 1000).toFixed(3)}</div>
              <div className="text-xs text-green-600 mt-1">Based on 1000 lessons</div>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-sm text-purple-700 mb-1">Your Cost/Lesson</div>
              <div className="text-2xl font-bold text-purple-900">${(analytics.total_cost / analytics.total_lessons).toFixed(3)}</div>
              <div className="text-xs text-purple-600 mt-1">Actual usage</div>
            </div>
            
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-sm text-yellow-700 mb-1">Savings</div>
              <div className="text-2xl font-bold text-yellow-900">${(29.99 - analytics.total_cost).toFixed(2)}</div>
              <div className="text-xs text-yellow-600 mt-1">This month</div>
            </div>
          </div>
        </div>

      {/* Quality Metrics */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quality Metrics</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">92%</div>
            <div className="text-sm text-gray-500 mt-1">Clarity</div>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">88%</div>
            <div className="text-sm text-gray-500 mt-1">Completeness</div>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">85%</div>
            <div className="text-sm text-gray-500 mt-1">Engagement</div>
          </div>
          
          <div className="text-center">
            <div className="text-3xl font-bold text-yellow-600">90%</div>
            <div className="text-sm text-gray-500 mt-1">Practicality</div>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-3">Recommendations</h2>
        <div className="space-y-3">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-blue-800 font-medium">Cost efficiency is excellent</p>
              <p className="text-blue-700 text-sm mt-1">You're using only 2.1% of your monthly budget with high-quality output.</p>
            </div>
          </div>
          
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-blue-800 font-medium">Consider increasing lesson complexity</p>
              <p className="text-blue-700 text-sm mt-1">Quality scores are high - you can handle more advanced topics.</p>
            </div>
          </div>
          
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-blue-800 font-medium">Peak usage: 9 AM - 11 AM</p>
              <p className="text-blue-700 text-sm mt-1">Consider scheduling batch processing during off-peak hours.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}