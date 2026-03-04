'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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

  if (loading || !status) {
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
          <h1 className="text-3xl font-bold text-gray-900">仪表板</h1>
          <p className="text-gray-600 mt-1">系统概览与快速操作</p>
        </div>
        <div className="text-sm text-gray-500">
          最后更新: {new Date().toLocaleTimeString('zh-CN')}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">快速操作</h2>
          <div className="space-y-4">
            <a
              href="/create"
              className="block w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors text-center"
            >
              创建新课程
            </a>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="/lessons"
                className="bg-gray-100 text-gray-700 px-4 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors text-center"
              >
                查看所有课程
              </a>
              <a
                href="/analytics"
                className="bg-gray-100 text-gray-700 px-4 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors text-center"
              >
                查看数据分析
              </a>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">系统状态</h2>
          <div className="space-y-3">
            {status && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">后端服务</span>
                  <span className={`px-2 py-1 rounded text-sm font-medium ${status.status === 'running' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                    {status.status === 'running' ? '在线' : '离线'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-700">AI课程生成</span>
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-sm font-medium rounded">
                    {status.services?.deepseek === 'configured' || status.services?.ai_lessons === 'active' ? '正常' : '维护中'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-700">已用课时</span>
                  <span className="font-medium">
                    {status.subscription?.lessons_used || 0} / {status.subscription?.lessons_included || 1000}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-700">月度费用</span>
                  <span className="font-medium">
                    ${status.subscription?.monthly_cost?.toFixed(2) || status.cost_analysis?.monthly_budget?.toFixed(2) || '0.00'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-700">续费日期</span>
                  <span className="font-medium">
                    {status.subscription?.renewal_date ? new Date(status.subscription.renewal_date).toLocaleDateString('zh-CN') : 'N/A'}
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
          <h2 className="text-xl font-semibold text-gray-900">最近课程</h2>
          <Link
            href="/lessons"
            className="text-blue-600 hover:text-blue-800 font-medium text-sm"
          >
            查看全部 →
          </Link>
        </div>

        {recentLessons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    时间
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    学生问题
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    课程标题
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    质量
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    成本
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentLessons.map((lesson) => (
                  <tr key={lesson.id} className="hover:bg-gray-50 group">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {new Date(lesson.timestamp).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">
                      {lesson.query}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-blue-600">
                      <Link href={`/lessons/${lesson.id}`} className="hover:underline">
                        {lesson.lesson_title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${lesson.quality_score >= 0.8 ? 'bg-green-100 text-green-800' :
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
            <p>尚未生成任何课程。</p>
            <p className="text-sm mt-2">点击"创建新课程"开始您的第一节课。</p>
          </div>
        )}
      </div>

      {/* Subscription Usage */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">订阅使用情况</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-blue-50 rounded-lg p-6">
            <div className="text-sm text-blue-700 mb-2">当前套餐</div>
            <div className="text-2xl font-bold text-blue-900 mb-2">专业版</div>
            <div className="text-sm text-blue-600">$29.99/月</div>
            <div className="mt-4">
              <div className="text-xs text-blue-700 mb-1">2026年2月23日续费</div>
              <div className="w-full bg-blue-100 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '15%' }}></div>
              </div>
            </div>
          </div>

          <div className="bg-green-50 rounded-lg p-6">
            <div className="text-sm text-green-700 mb-2">本月课时</div>
            <div className="text-2xl font-bold text-green-900 mb-2">42 / 1000</div>
            <div className="text-sm text-green-600">已使用4.2%</div>
            <div className="mt-4">
              <div className="text-xs text-green-700 mb-1">剩余958课时</div>
              <div className="w-full bg-green-100 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '4.2%' }}></div>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 rounded-lg p-6">
            <div className="text-sm text-purple-700 mb-2">成本效率</div>
            <div className="text-2xl font-bold text-purple-900 mb-2">$3.42</div>
            <div className="text-sm text-purple-600">本月已使用</div>
            <div className="mt-4">
              <div className="text-xs text-purple-700 mb-1">仅占月度费用11.4%</div>
              <div className="w-full bg-purple-100 rounded-full h-2">
                <div className="bg-purple-500 h-2 rounded-full" style={{ width: '11.4%' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-medium text-gray-900">需要更多课时？</div>
              <div className="text-sm text-gray-500 mt-1">升级到企业版获得无限使用</div>
            </div>
            <a
              href="/settings#subscription"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              升级套餐
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}