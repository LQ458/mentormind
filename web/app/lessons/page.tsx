'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Lesson {
  id: string
  timestamp: string
  query: string
  lesson_title: string
  quality_score: number
  cost_usd: number
}

export default function LessonsPage() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [query, setQuery] = useState('')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetchLessons()
  }, [])

  const fetchLessons = async () => {
    try {
      const response = await fetch('/api/backend/results')
      const data = await response.json()
      setLessons(data.results || [])
    } catch (error) {
      console.error('Failed to fetch lessons:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateLesson = async () => {
    if (!query.trim()) {
      alert('Please enter a query')
      return
    }

    setGenerating(true)
    try {
      const response = await fetch('/api/backend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentQuery: query }),
      })
      
      const data = await response.json()
      if (data.success) {
        alert(`Lesson generated successfully: ${data.lesson_plan?.title}`)
        setQuery('')
        fetchLessons() // Refresh the list
      } else {
        alert('Failed to generate lesson')
      }
    } catch (error) {
      console.error('Failed to generate lesson:', error)
      alert('Failed to generate lesson')
    } finally {
      setGenerating(false)
    }
  }

  const deleteLesson = async (id: string) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return
    
    // Note: In a real implementation, we would have a DELETE endpoint
    // For now, we'll just remove it from the UI
    setLessons(lessons.filter(lesson => lesson.id !== id))
  }

  const viewLessonDetails = (lesson: Lesson) => {
    setSelectedLesson(lesson)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading lessons...</div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lessons</h1>
          <p className="text-gray-600 mt-1">Create and manage AI-generated lessons</p>
        </div>
        <div className="text-sm text-gray-500">
          Total: {lessons.length} lessons
        </div>
      </div>

      {/* Create New Lesson */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Create New Lesson</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              What does the student want to learn?
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
              placeholder="Example: 我想学习Python编程，从哪里开始？"
            />
            <p className="text-sm text-gray-500 mt-2">
              Enter a question or topic in Chinese for best results
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={generateLesson}
              disabled={generating || !query.trim()}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? 'Generating...' : 'Generate Lesson Plan'}
            </button>
            
            <button
              onClick={() => setQuery('')}
              className="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Lesson List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">All Lessons</h2>
        </div>
        
        {lessons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student Query
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Lesson Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quality
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {lessons.map((lesson) => (
                  <tr key={lesson.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(lesson.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                      <div className="truncate" title={lesson.query}>
                        {lesson.query}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {lesson.lesson_title}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-24 bg-gray-200 rounded-full h-2 mr-3">
                          <div 
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${lesson.quality_score * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">
                          {(lesson.quality_score * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${lesson.cost_usd?.toFixed(4) || '0.0000'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => viewLessonDetails(lesson)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        View
                      </button>
                      <button
                        onClick={() => deleteLesson(lesson.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">No lessons yet</h3>
            <p className="text-gray-500 mb-6">Create your first lesson using the form above</p>
            <button
              onClick={() => document.querySelector('textarea')?.focus()}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Lesson
            </button>
          </div>
        )}
      </div>

      {/* Lesson Details Modal */}
      {selectedLesson && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Lesson Details</h3>
              <button
                onClick={() => setSelectedLesson(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">Student Query</h4>
                <p className="mt-1 text-gray-900">{selectedLesson.query}</p>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-gray-500">Lesson Title</h4>
                <p className="mt-1 text-gray-900">{selectedLesson.lesson_title}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Generated</h4>
                  <p className="mt-1 text-gray-900">
                    {new Date(selectedLesson.timestamp).toLocaleString()}
                  </p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Quality Score</h4>
                  <p className="mt-1 text-gray-900">
                    {(selectedLesson.quality_score * 100).toFixed(0)}%
                  </p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Cost</h4>
                  <p className="mt-1 text-gray-900">
                    ${selectedLesson.cost_usd?.toFixed(4) || '0.0000'}
                  </p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Lesson ID</h4>
                  <p className="mt-1 text-gray-900 font-mono text-sm">
                    {selectedLesson.id}
                  </p>
                </div>
              </div>
              
              <div className="pt-4 border-t border-gray-200">
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setSelectedLesson(null)}
                    className="px-4 py-2 text-gray-700 hover:text-gray-900"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      // In a real implementation, this would download the lesson
                      alert('Download feature would be implemented here')
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Download Lesson
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