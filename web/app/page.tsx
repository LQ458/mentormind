'use client'

import Link from 'next/link'
import { useLanguage } from './components/LanguageContext'

export default function HomePage() {
  const { language, t } = useLanguage()

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          {t('home.heroTitle')}
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          {t('home.heroSubtitle')}
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          <Link
            href="/create"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('home.startCreating')}
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center px-6 py-3 bg-white text-gray-700 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('home.viewDashboard')}
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('home.feature1Title')}</h3>
          <p className="text-gray-600">{t('home.feature1Desc')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('home.feature2Title')}</h3>
          <p className="text-gray-600">{t('home.feature2Desc')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('home.feature3Title')}</h3>
          <p className="text-gray-600">{t('home.feature3Desc')}</p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('home.quickAccessTitle')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/create"
            className="bg-white rounded-lg p-4 text-center border border-gray-200 hover:border-blue-500 hover:shadow-sm transition-all"
          >
            <div className="text-blue-600 font-medium">{t('home.createLesson')}</div>
            <div className="text-sm text-gray-500 mt-1">{t('home.createLessonDesc')}</div>
          </Link>
          <Link
            href="/lessons"
            className="bg-white rounded-lg p-4 text-center border border-gray-200 hover:border-blue-500 hover:shadow-sm transition-all"
          >
            <div className="text-blue-600 font-medium">{t('home.lessonManagement')}</div>
            <div className="text-sm text-gray-500 mt-1">{t('home.lessonManagementDesc')}</div>
          </Link>
          <Link
            href="/analytics"
            className="bg-white rounded-lg p-4 text-center border border-gray-200 hover:border-blue-500 hover:shadow-sm transition-all"
          >
            <div className="text-blue-600 font-medium">{t('home.analyticsLink')}</div>
            <div className="text-sm text-gray-500 mt-1">{t('home.analyticsLinkDesc')}</div>
          </Link>
          <Link
            href="/settings"
            className="bg-white rounded-lg p-4 text-center border border-gray-200 hover:border-blue-500 hover:shadow-sm transition-all"
          >
            <div className="text-blue-600 font-medium">{t('home.settingsLink')}</div>
            <div className="text-sm text-gray-500 mt-1">{t('home.settingsLinkDesc')}</div>
          </Link>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('home.systemStatusTitle')}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              <span className="font-medium">Backend API</span>
            </div>
            <span className="text-green-600 font-medium">{t('home.online')}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              <span className="font-medium">DeepSeek API</span>
            </div>
            <span className="text-green-600 font-medium">{t('home.connected')}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
              <span className="font-medium">FunASR Service</span>
            </div>
            <span className="text-yellow-600 font-medium">{t('home.simulated')}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
              <span className="font-medium">PaddleOCR Service</span>
            </div>
            <span className="text-yellow-600 font-medium">{t('home.simulated')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}