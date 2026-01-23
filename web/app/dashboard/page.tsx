'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface SystemStatus {
  status: string
  version: string
  services: {
    deepseek: string
    funasr: string
    paddle_ocr: string
    tts: string
  }
  cost_analysis: {
    monthly_budget: number
    current_month: number
    remaining: number
  }
  configuration: {
    max_lesson_duration_minutes: number
    quality_threshold: number
    max_teaching_attempts: number
    tts_provider: string
    avatar_provider: string
  }
}

export default function DashboardPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [recentLessons, setRecentLessons] = useState<any[]>([])
  const [query, setQuery] = useState('我想学习Python编程，从哪里开始？')

  useEffect(() => {
    fetchStatus()
    fetchRecentLessons()
  }, [])

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
      const response = await fetch('/api/backend/results')
      const data = await response.json()
      setRecentLessons(data.results || [])
    } catch (error) {
      console.error('Failed to fetch lessons:', error)
    }
  }

  const generateLesson = async () => {
    if (!query.trim()) return
    
    try {
      const response = await fetch('/api/backend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentQuery: query }),
      })
      
      const data = await response.json()
      alert(`Lesson generated: ${data.lesson_plan?.title}`)
      fetchRecentLessons() // Refresh the list
    } catch (error) {
      console.error('Failed to generate lesson:', error)
      alert('Failed to generate lesson')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading system status...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">System overview and quick actions</p>
        </div>
        <div className="text-sm text-gray-500">
          Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Quick Lesson Generation */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Lesson Generation</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Student Query
              </label>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder="Enter what the student wants to learn..."
              />
            </div>
            <button
              onClick={generateLesson}
              className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Generate Lesson Plan
            </button>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">System Status</h2>
          <div className="space-y-3">
            {status && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Backend API</span>
                  <span className={`px-2 py-1 rounded text-sm font-medium ${
                    status.status === 'online' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {status.status}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">DeepSeek API</span>
                  <span className={`px-2 py-1 rounded text-sm font-medium ${
                    status.services.deepseek === 'configured' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {status.services.deepseek}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Monthly Budget</span>
                  <span className="font-medium">
                    ${status.cost_analysis.current_month.toFixed(2)} / ${status.cost_analysis.monthly_budget}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Remaining</span>
                  <span className={`font-medium ${
                    status.cost_analysis.remaining > 50 ? 'text-green-600' : 
                    status.cost_analysis.remaining > 10 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    ${status.cost_analysis.remaining.toFixed(2)}
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
          <h2 className="text-xl font-semibold text-gray-900">Recent Lessons</h2>
          <Link
            href="/lessons"
            className="text-blue-600 hover:text-blue-800 font-medium text-sm"
          >
            View all →
          </Link>
        </div>
        
        {recentLessons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Query
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quality
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentLessons.map((lesson) => (
                  <tr key={lesson.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {new Date(lesson.timestamp).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
                      {lesson.query}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {lesson.lesson_title}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        lesson.quality_score >= 0.8 ? 'bg-green-100 text-green-800' :
                        lesson.quality_score >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {(lesson.quality_score * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      ${lesson.cost_usd?.toFixed(4) || '0.0000'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No lessons generated yet.</p>
            <p className="text-sm mt-2">Generate your first lesson using the form above.</p>
          </div>
        )}
      </div>

      {/* Service Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Service Configuration</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {status && Object.entries(status.configuration).map(([key, value]) => (
            <div key={key} className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-500 capitalize">
                {key.replace(/_/g, ' ')}
              </div>
              <div className="font-medium text-gray-900 mt-1">
                {typeof value === 'number' ? value.toFixed(1) : value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}