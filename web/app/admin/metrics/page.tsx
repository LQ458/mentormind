'use client'

import { useState, useEffect } from 'react'
import { useLanguage } from '../../components/LanguageContext'

interface GenerationMetrics {
  total_time?: number
  script_time?: number  
  render_time?: number
  tts_time?: number
}

interface LessonMetrics {
  id: string
  title: string
  topic: string
  language: string
  student_level: string
  quality_score: number
  cost_usd: number
  duration_minutes: number
  created_at: string
  updated_at: string
  total_views: number
  avg_watch_percentage: number
  completions: number
  video_url?: string
  audio_url?: string
  generation_metrics: GenerationMetrics
  ai_insights: any
}

interface MetricsData {
  success: boolean
  summary: {
    total_lessons: number
    total_cost_usd: number
    avg_quality_score: number
    total_views: number
  }
  lessons: LessonMetrics[]
}

export default function AdminMetricsPage() {
  const { language: uiLanguage } = useLanguage()
  const [metrics, setMetrics] = useState<MetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'created_at' | 'quality_score' | 'cost_usd' | 'total_views'>('created_at')

  useEffect(() => {
    fetchMetrics()
  }, [])

  const fetchMetrics = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('http://localhost:8000/admin/metrics')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.success) {
        setMetrics(data)
      } else {
        throw new Error('Metrics endpoint returned an error')
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err)
      setError(uiLanguage === 'zh' ? '无法加载指标数据' : 'Could not load metrics data')
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds?: number) => {
    if (!seconds) return 'N/A'
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(uiLanguage === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const sortedLessons = metrics?.lessons.sort((a, b) => {
    switch (sortBy) {
      case 'quality_score':
        return (b.quality_score || 0) - (a.quality_score || 0)
      case 'cost_usd':
        return (b.cost_usd || 0) - (a.cost_usd || 0)
      case 'total_views':
        return (b.total_views || 0) - (a.total_views || 0)
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
  }) || []

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">
          {uiLanguage === 'zh' ? '加载中...' : 'Loading...'}
        </div>
      </div>
    )
  }

  if (error || !metrics) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {error || (uiLanguage === 'zh' ? '无指标数据' : 'No metrics data')}
        </h3>
        <button
          onClick={fetchMetrics}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          {uiLanguage === 'zh' ? '重试' : 'Retry'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {uiLanguage === 'zh' ? '视频生成指标' : 'Video Generation Metrics'}
          </h1>
          <p className="text-gray-600 mt-1">
            {uiLanguage === 'zh' ? '所有课程的创建时间、质量评分和性能数据' : 'Creation times, quality scores, and performance data for all lessons'}
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
        >
          {uiLanguage === 'zh' ? '刷新' : 'Refresh'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">
            {uiLanguage === 'zh' ? '总课程数' : 'Total Lessons'}
          </div>
          <div className="text-3xl font-bold text-gray-900">{metrics.summary.total_lessons}</div>
          <div className="text-sm text-blue-600 mt-2">
            {metrics.summary.total_views} {uiLanguage === 'zh' ? '总观看次数' : 'total views'}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">
            {uiLanguage === 'zh' ? '平均质量评分' : 'Avg Quality Score'}
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {metrics.summary.avg_quality_score.toFixed(2)}
          </div>
          <div className="text-sm text-green-600 mt-2">
            {uiLanguage === 'zh' ? '满分 1.0' : 'out of 1.0'}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">
            {uiLanguage === 'zh' ? '总成本' : 'Total Cost'}
          </div>
          <div className="text-3xl font-bold text-gray-900">
            ${metrics.summary.total_cost_usd.toFixed(2)}
          </div>
          <div className="text-sm text-purple-600 mt-2">
            ${(metrics.summary.total_cost_usd / Math.max(metrics.summary.total_lessons, 1)).toFixed(2)} {uiLanguage === 'zh' ? '每课程' : 'per lesson'}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">
            {uiLanguage === 'zh' ? '活跃课程' : 'Active Lessons'}
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {sortedLessons.filter(l => l.total_views > 0).length}
          </div>
          <div className="text-sm text-yellow-600 mt-2">
            {uiLanguage === 'zh' ? '有观看记录' : 'with views'}
          </div>
        </div>
      </div>

      {/* Lessons Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">
              {uiLanguage === 'zh' ? '课程详情' : 'Lesson Details'}
            </h2>
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-500">
                {uiLanguage === 'zh' ? '排序:' : 'Sort by:'}
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="text-sm border border-gray-300 rounded-md px-2 py-1"
              >
                <option value="created_at">{uiLanguage === 'zh' ? '创建时间' : 'Created'}</option>
                <option value="quality_score">{uiLanguage === 'zh' ? '质量评分' : 'Quality'}</option>
                <option value="cost_usd">{uiLanguage === 'zh' ? '成本' : 'Cost'}</option>
                <option value="total_views">{uiLanguage === 'zh' ? '观看次数' : 'Views'}</option>
              </select>
            </div>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {uiLanguage === 'zh' ? '课程' : 'Lesson'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {uiLanguage === 'zh' ? '质量/成本' : 'Quality/Cost'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {uiLanguage === 'zh' ? '生成时间' : 'Generation Time'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {uiLanguage === 'zh' ? '参与度' : 'Engagement'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {uiLanguage === 'zh' ? '创建时间' : 'Created'}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedLessons.map((lesson) => (
                <tr key={lesson.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                        {lesson.title}
                      </div>
                      <div className="text-sm text-gray-500">
                        {lesson.topic} • {lesson.language} • {lesson.student_level}
                      </div>
                      <div className="text-xs text-gray-400">
                        {lesson.duration_minutes}min
                        {lesson.video_url && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Video
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      Quality: {lesson.quality_score?.toFixed(2) || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-500">
                      Cost: ${lesson.cost_usd?.toFixed(2) || '0.00'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatTime(lesson.generation_metrics.total_time)}
                    </div>
                    <div className="text-xs text-gray-500 space-y-0.5">
                      {lesson.generation_metrics.script_time && (
                        <div>Script: {formatTime(lesson.generation_metrics.script_time)}</div>
                      )}
                      {lesson.generation_metrics.render_time && (
                        <div>Render: {formatTime(lesson.generation_metrics.render_time)}</div>
                      )}
                      {lesson.generation_metrics.tts_time && (
                        <div>TTS: {formatTime(lesson.generation_metrics.tts_time)}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {lesson.total_views} {uiLanguage === 'zh' ? '观看' : 'views'}
                    </div>
                    <div className="text-sm text-gray-500">
                      {lesson.avg_watch_percentage}% {uiLanguage === 'zh' ? '平均进度' : 'avg progress'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {lesson.completions} {uiLanguage === 'zh' ? '完成' : 'completions'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(lesson.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}