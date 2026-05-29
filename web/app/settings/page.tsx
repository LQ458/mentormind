'use client'

import { useState, Suspense } from 'react'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '../components/AuthContext'
import { toast } from 'sonner'

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}

function SettingsContent() {
  const { language: uiLanguage, t } = useLanguage()
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState({
    default_language: 'zh-CN',
    auto_generate_video: true,
    quality_threshold: 0.8,
    email_notifications: true,
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      toast.success(t('settings.settingsSaved'))
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast.error(t('settings.settingsSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {t('settings.pageTitle')}
          </h1>
          <p className="text-gray-600 mt-1">
            {t('settings.pageDescription')}
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? t('settings.saving') : t('settings.saveChanges')}
          </button>
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">{t('settings.preferences')}</h2>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.defaultLanguage')}
            </label>
            <select
              value={preferences.default_language}
              onChange={(e) => setPreferences({ ...preferences, default_language: e.target.value })}
              className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="zh-CN">{t('settings.chineseSimplified')}</option>
              <option value="en-US">{t('settings.englishUS')}</option>
              <option value="ja-JP">{t('settings.japanese')}</option>
              <option value="ko-KR">{t('settings.korean')}</option>
            </select>
            <p className="text-sm text-gray-500 mt-2">
              {t('settings.defaultLanguageDescription')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.minimumQualityThreshold')}
            </label>
            <div className="flex items-center">
              <input
                type="range"
                value={preferences.quality_threshold * 100}
                onChange={(e) => setPreferences({ ...preferences, quality_threshold: parseInt(e.target.value) / 100 })}
                className="w-full"
                min="60"
                max="95"
              />
              <span className="ml-4 w-16 text-right font-medium">
                {(preferences.quality_threshold * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {t('settings.qualityThresholdDescription')}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">{t('settings.autoGenerateVideoLessons')}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {t('settings.autoGenerateVideoDescription')}
                </div>
              </div>
              <button
                onClick={() => setPreferences({ ...preferences, auto_generate_video: !preferences.auto_generate_video })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${preferences.auto_generate_video ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${preferences.auto_generate_video ? 'translate-x-6' : 'translate-x-1'
                  }`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">{t('settings.emailNotifications')}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {t('settings.emailNotificationsDescription')}
                </div>
              </div>
              <button
                onClick={() => setPreferences({ ...preferences, email_notifications: !preferences.email_notifications })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${preferences.email_notifications ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${preferences.email_notifications ? 'translate-x-6' : 'translate-x-1'
                  }`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
