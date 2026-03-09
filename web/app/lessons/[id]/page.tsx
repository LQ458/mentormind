'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useLanguage } from '../../components/LanguageContext'

export default function LessonDetailPage() {
    const params = useParams()
    const router = useRouter()
    const { language, t } = useLanguage()
    const [lesson, setLesson] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'content' | 'video' | 'script'>('video')

    useEffect(() => {
        if (params?.id) {
            fetchLessonDetails(params.id as string)
        }
    }, [params?.id])

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

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    if (!lesson) return null

    const BACKEND_PUBLIC = process.env.NEXT_PUBLIC_API_URL || ''
    const videoUrl = lesson.video_url
        ? (lesson.video_url.startsWith('http') ? lesson.video_url : `${BACKEND_PUBLIC}${lesson.video_url}`)
        : null
    const audioUrl = lesson.audio_url
        ? (lesson.audio_url.startsWith('http') ? lesson.audio_url : `${BACKEND_PUBLIC}${lesson.audio_url}`)
        : null

    return (
        <div className="min-h-screen bg-gray-50 pb-12">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center">
                            <Link
                                href="/lessons"
                                className="text-gray-500 hover:text-gray-900 mr-4 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900 truncate max-w-lg">
                                    {lesson.class_title}
                                </h1>
                                <p className="text-sm text-gray-500">
                                    {new Date(lesson.timestamp).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')} • {lesson.duration_minutes} {t('common.minutes')} • {lesson.student_level}
                                </p>
                            </div>
                        </div>
                        <div className="flex space-x-3">
                            <button
                                onClick={() => window.print()}
                                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                            >
                                {t('lessonDetail.downloadPdf')}
                            </button>
                            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
                                {t('lessonDetail.startQuiz')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Main Content Area */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Video Player */}
                        <div className="bg-black rounded-2xl overflow-hidden shadow-lg aspect-video relative group">
                            {videoUrl ? (
                                <video
                                    src={videoUrl}
                                    controls
                                    className="w-full h-full object-contain"
                                    poster={lesson.ai_insights?.avatar_image || "/placeholder-video.jpg"}
                                >
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

                        {/* Content Tabs */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="flex border-b border-gray-200">
                                <button
                                    onClick={() => setActiveTab('content')}
                                    className={`flex-1 py-4 text-sm font-medium text-center ${activeTab === 'content'
                                        ? 'text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    {t('lessonDetail.tabLessonPlan')}
                                </button>
                                <button
                                    onClick={() => setActiveTab('script')}
                                    className={`flex-1 py-4 text-sm font-medium text-center ${activeTab === 'script'
                                        ? 'text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    {t('lessonDetail.tabTranscript')}
                                </button>
                                <button
                                    onClick={() => setActiveTab('video')}
                                    className={`flex-1 py-4 text-sm font-medium text-center ${activeTab === 'video'
                                        ? 'text-blue-600 border-b-2 border-blue-600'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    {t('lessonDetail.tabAiInsights')}
                                </button>
                            </div>

                            <div className="p-6">
                                {activeTab === 'content' && (
                                    <div className="prose max-w-none">
                                        <h3 className="text-lg font-bold mb-4">{t('lessonDetail.learningObjectives')}</h3>
                                        <ul className="list-disc pl-5 mb-6 space-y-2">
                                            {lesson.learning_objectives?.map((obj: string, i: number) => (
                                                <li key={i} className="text-gray-700">{obj}</li>
                                            )) || <li>{t('lessonDetail.noObjectives')}</li>}
                                        </ul>

                                        <h3 className="text-lg font-bold mb-4">{t('lessonDetail.coreConcepts')}</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                            {Object.entries(lesson.lesson_plan || {}).map(([key, value]: [string, any]) => (
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

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('lessonDetail.yourProgress')}</h3>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-600">{t('lessonDetail.completion')}</span>
                                        <span className="font-medium text-gray-900">0%</span>
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-2">
                                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: '0%' }}></div>
                                    </div>
                                </div>
                                <button className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                                    {t('lessonDetail.markComplete')}
                                </button>
                            </div>
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
