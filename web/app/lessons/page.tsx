'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '@clerk/nextjs'

interface Lesson {
  id: string
  timestamp: string
  query: string
  lesson_title: string
  quality_score: number
  cost_usd: number
}

export default function LessonsPage() {
  const { language, t } = useLanguage()
  const { getToken, isSignedIn } = useAuth()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)

  useEffect(() => {
    fetchLessons()
  }, [])

  const fetchLessons = async () => {
    try {
      const endpoint = isSignedIn ? '/api/backend/users/me/lessons' : '/api/backend/results'
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const response = await fetch(endpoint, { headers })
      const data = await response.json()
      const rawLessons = Array.isArray(data) ? data : (data.results || [])
      setLessons(rawLessons.map((lesson: any) => ({
        id: lesson.id,
        timestamp: lesson.timestamp || lesson.created_at,
        query: lesson.query || lesson.topic,
        lesson_title: lesson.lesson_title || lesson.title,
        quality_score: lesson.quality_score || 0,
        cost_usd: lesson.cost_usd || 0,
      })))
    } catch (error) {
      console.error('Failed to fetch lessons:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteLesson = async (id: string) => {
    if (!confirm(t('lessons.deleteConfirm'))) return

    try {
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const response = await fetch(`/api/backend/lessons/${id}`, { method: 'DELETE', headers })
      if (response.ok) {
        setLessons(lessons.filter(lesson => lesson.id !== id))
      } else {
        const data = await response.json()
        alert(`${t('lessons.deleteFailed')}: ${data.details || ''}`)
      }
    } catch (error) {
      console.error('Failed to delete lesson:', error)
      alert(t('lessons.deleteFailed'))
    }
  }

  const deleteAllLessons = async () => {
    if (!confirm(t('lessons.deleteAllConfirm1'))) return
    if (!confirm(t('lessons.deleteAllConfirm2'))) return

    try {
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const response = await fetch('/api/backend/lessons', { method: 'DELETE', headers })
      if (response.ok) {
        setLessons([])
        alert(t('lessons.deletedSuccess'))
      } else {
        const data = await response.json()
        alert(`${t('lessons.deleteAllFailed')}: ${data.details || ''}`)
      }
    } catch (error) {
      console.error('Failed to delete all lessons:', error)
      alert(t('lessons.deleteAllFailed'))
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">{t('lessons.loading')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('lessons.pageTitle')}</h1>
          <p className="text-gray-600 mt-1">{t('lessons.pageSubtitle')}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">{t('lessons.totalCount', { n: lessons.length })}</div>
          {lessons.length > 0 && (
            <button
              onClick={deleteAllLessons}
              className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors"
            >
              {t('lessons.deleteAll')}
            </button>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-6">
        <a
          href="/create"
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-blue-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t('lessons.createNew')}</h3>
              <p className="text-sm text-gray-500 mt-1">{t('lessons.createNewDesc')}</p>
            </div>
          </div>
          <div className="text-blue-600 font-medium group-hover:text-blue-700">{t('lessons.startCreating')}</div>
        </a>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t('lessons.batchImport')}</h3>
              <p className="text-sm text-gray-500 mt-1">{t('lessons.batchImportDesc')}</p>
            </div>
          </div>
          <button className="text-gray-600 font-medium hover:text-gray-800">{t('lessons.uploadFile')}</button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t('lessons.exportLessons')}</h3>
              <p className="text-sm text-gray-500 mt-1">{t('lessons.exportLessonsDesc')}</p>
            </div>
          </div>
          <button className="text-gray-600 font-medium hover:text-gray-800">{t('lessons.selectLesson')}</button>
        </div>
      </div>

      {/* Lesson List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">{t('lessons.allLessonsHeader')}</h2>
        </div>

        {lessons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lessons.dateTimeHeader')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lessons.studentQueryHeader')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lessons.lessonTitleHeader')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lessons.qualityHeader')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lessons.costHeader')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{t('lessons.actionsHeader')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {lessons.map((lesson) => (
                  <tr key={lesson.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(lesson.timestamp).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                      <div className="truncate" title={lesson.query}>{lesson.query}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{lesson.lesson_title}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-24 bg-gray-200 rounded-full h-2 mr-3">
                          <div className="bg-green-500 h-2 rounded-full" style={{ width: `${lesson.quality_score * 100}%` }} />
                        </div>
                        <span className="text-sm font-medium">{(lesson.quality_score * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${lesson.cost_usd?.toFixed(4) || '0.0000'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <Link href={`/lessons/${lesson.id}`} className="text-blue-600 hover:text-blue-900 mr-4">
                        {t('lessons.viewAction')}
                      </Link>
                      <button onClick={() => deleteLesson(lesson.id)} className="text-red-600 hover:text-red-900">
                        {t('lessons.deleteAction')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">{t('lessons.noLessonsTitle')}</h3>
            <p className="text-gray-500 mb-6">{t('lessons.noLessonsDesc')}</p>
            <Link
              href="/create"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('lessons.createLessonButton')}
            </Link>
          </div>
        )}
      </div>

      {/* Lesson Details Modal */}
      {selectedLesson && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">{t('lessons.detailsTitle')}</h3>
              <button onClick={() => setSelectedLesson(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">{t('lessons.studentQueryLabel')}</h4>
                <p className="mt-1 text-gray-900">{selectedLesson.query}</p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">{t('lessons.lessonTitleLabel')}</h4>
                <p className="mt-1 text-gray-900">{selectedLesson.lesson_title}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500">{t('lessons.generatedLabel')}</h4>
                  <p className="mt-1 text-gray-900">{new Date(selectedLesson.timestamp).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500">{t('lessons.qualityScoreLabel')}</h4>
                  <p className="mt-1 text-gray-900">{(selectedLesson.quality_score * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500">{t('lessons.costLabel')}</h4>
                  <p className="mt-1 text-gray-900">${selectedLesson.cost_usd?.toFixed(4) || '0.0000'}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500">{t('lessons.lessonIdLabel')}</h4>
                  <p className="mt-1 text-gray-900 font-mono text-sm">{selectedLesson.id}</p>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <div className="flex justify-end gap-3">
                  <button onClick={() => setSelectedLesson(null)} className="px-4 py-2 text-gray-700 hover:text-gray-900">
                    {t('lessons.closeButton')}
                  </button>
                  <button
                    onClick={() => alert(t('common.loading'))}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {t('lessons.downloadButton')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
