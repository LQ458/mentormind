'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Settings {
  api_keys: {
    deepseek: string
    funasr: string
    paddle_ocr: string
  }
  budget: {
    monthly_limit: number
    alert_threshold: number
    currency: string
  }
  quality: {
    min_score: number
    max_attempts: number
    auto_regenerate: boolean
  }
  output: {
    tts_provider: string
    avatar_provider: string
    default_language: string
    auto_generate_video: boolean
  }
  notifications: {
    email_alerts: boolean
    cost_alerts: boolean
    quality_alerts: boolean
    system_alerts: boolean
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    api_keys: {
      deepseek: 'sk-02886f9046bc474db48154f66df0c2fb',
      funasr: '',
      paddle_ocr: '',
    },
    budget: {
      monthly_limit: 160,
      alert_threshold: 80,
      currency: 'USD',
    },
    quality: {
      min_score: 0.8,
      max_attempts: 3,
      auto_regenerate: true,
    },
    output: {
      tts_provider: 'mock',
      avatar_provider: 'mock',
      default_language: 'zh-CN',
      auto_generate_video: true,
    },
    notifications: {
      email_alerts: true,
      cost_alerts: true,
      quality_alerts: false,
      system_alerts: true,
    },
  })

  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('api')

  const handleSave = async () => {
    setSaving(true)
    try {
      // In a real implementation, this would save to the backend
      await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate API call
      alert('Settings saved successfully!')
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      setSettings({
        api_keys: {
          deepseek: '',
          funasr: '',
          paddle_ocr: '',
        },
        budget: {
          monthly_limit: 160,
          alert_threshold: 80,
          currency: 'USD',
        },
        quality: {
          min_score: 0.8,
          max_attempts: 3,
          auto_regenerate: true,
        },
        output: {
          tts_provider: 'mock',
          avatar_provider: 'mock',
          default_language: 'zh-CN',
          auto_generate_video: true,
        },
        notifications: {
          email_alerts: true,
          cost_alerts: true,
          quality_alerts: false,
          system_alerts: true,
        },
      })
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Configure your MentorMind system</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'api', label: 'API Keys' },
            { id: 'budget', label: 'Budget' },
            { id: 'quality', label: 'Quality' },
            { id: 'output', label: 'Output' },
            { id: 'notifications', label: 'Notifications' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 font-medium text-sm border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* API Keys Tab */}
      {activeTab === 'api' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">API Configuration</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  DeepSeek API Key
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={settings.api_keys.deepseek}
                    onChange={(e) => setSettings({
                      ...settings,
                      api_keys: { ...settings.api_keys, deepseek: e.target.value }
                    })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                    placeholder="Enter your DeepSeek API key"
                  />
                  <button
                    onClick={() => {
                      const input = document.querySelector('input[type="password"]') as HTMLInputElement
                      if (input) {
                        input.type = input.type === 'password' ? 'text' : 'password'
                      }
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    type="button"
                  >
                    👁️
                  </button>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Your DeepSeek API key is used for AI lesson generation
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  FunASR API Key (Optional)
                </label>
                <input
                  type="password"
                  value={settings.api_keys.funasr}
                  onChange={(e) => setSettings({
                    ...settings,
                    api_keys: { ...settings.api_keys, funasr: e.target.value }
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your FunASR API key"
                />
                <p className="text-sm text-gray-500 mt-2">
                  For Chinese speech recognition (leave empty for simulated mode)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  PaddleOCR API Key (Optional)
                </label>
                <input
                  type="password"
                  value={settings.api_keys.paddle_ocr}
                  onChange={(e) => setSettings({
                    ...settings,
                    api_keys: { ...settings.api_keys, paddle_ocr: e.target.value }
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your PaddleOCR API key"
                />
                <p className="text-sm text-gray-500 mt-2">
                  For Chinese text extraction from slides (leave empty for simulated mode)
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">API Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-blue-800">DeepSeek API</span>
                <span className="px-2 py-1 bg-green-100 text-green-800 text-sm font-medium rounded">
                  Connected
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-800">FunASR Service</span>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded">
                  Simulated
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-800">PaddleOCR Service</span>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded">
                  Simulated
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Budget Tab */}
      {activeTab === 'budget' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Budget Settings</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monthly Budget Limit
                </label>
                <div className="flex items-center">
                  <span className="mr-3 text-gray-500">$</span>
                  <input
                    type="number"
                    value={settings.budget.monthly_limit}
                    onChange={(e) => setSettings({
                      ...settings,
                      budget: { ...settings.budget, monthly_limit: parseFloat(e.target.value) }
                    })}
                    className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min="0"
                    step="10"
                  />
                  <span className="ml-3 text-gray-500">USD</span>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Maximum monthly spending on API services
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alert Threshold
                </label>
                <div className="flex items-center">
                  <input
                    type="range"
                    value={settings.budget.alert_threshold}
                    onChange={(e) => setSettings({
                      ...settings,
                      budget: { ...settings.budget, alert_threshold: parseInt(e.target.value) }
                    })}
                    className="w-full"
                    min="0"
                    max="100"
                  />
                  <span className="ml-4 w-16 text-right font-medium">
                    {settings.budget.alert_threshold}%
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Receive alerts when spending reaches this percentage of your budget
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Currency
                </label>
                <select
                  value={settings.budget.currency}
                  onChange={(e) => setSettings({
                    ...settings,
                    budget: { ...settings.budget, currency: e.target.value }
                  })}
                  className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="USD">USD ($)</option>
                  <option value="CNY">CNY (¥)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-green-50 rounded-xl border border-green-200 p-6">
            <h3 className="text-lg font-semibold text-green-900 mb-3">Current Usage</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm text-green-800 mb-1">
                  <span>Monthly Spending</span>
                  <span>$3.42 / ${settings.budget.monthly_limit}</span>
                </div>
                <div className="w-full bg-green-100 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${(3.42 / settings.budget.monthly_limit) * 100}%` }}
                  />
                </div>
                <p className="text-sm text-green-700 mt-2">
                  Only 2.1% of budget used - excellent efficiency!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quality Tab */}
      {activeTab === 'quality' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quality Settings</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Quality Score
              </label>
              <div className="flex items-center">
                <input
                  type="range"
                  value={settings.quality.min_score * 100}
                  onChange={(e) => setSettings({
                    ...settings,
                    quality: { ...settings.quality, min_score: parseInt(e.target.value) / 100 }
                  })}
                  className="w-full"
                  min="50"
                  max="100"
                />
                <span className="ml-4 w-16 text-right font-medium">
                  {(settings.quality.min_score * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Lessons below this score will be flagged for review
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Regeneration Attempts
              </label>
              <div className="flex items-center space-x-4">
                {[1, 2, 3, 5].map((attempts) => (
                  <button
                    key={attempts}
                    onClick={() => setSettings({
                      ...settings,
                      quality: { ...settings.quality, max_attempts: attempts }
                    })}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      settings.quality.max_attempts === attempts
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {attempts} {attempts === 1 ? 'attempt' : 'attempts'}
                  </button>
                ))}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Number of times to retry generating a lesson if quality is low
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">Auto-regenerate low quality lessons</div>
                <div className="text-sm text-gray-500 mt-1">
                  Automatically retry generation when quality score is below threshold
                </div>
              </div>
              <button
                onClick={() => setSettings({
                  ...settings,
                  quality: { ...settings.quality, auto_regenerate: !settings.quality.auto_regenerate }
                })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.quality.auto_regenerate ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.quality.auto_regenerate ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Output Tab */}
      {activeTab === 'output' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Output Settings</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Text-to-Speech Provider
              </label>
              <select
                value={settings.output.tts_provider}
                onChange={(e) => setSettings({
                  ...settings,
                  output: { ...settings.output, tts_provider: e.target.value }
                })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="mock">Mock (Simulated)</option>
                <option value="azure">Microsoft Azure</option>
                <option value="google">Google Cloud TTS</option>
                <option value="aws">Amazon Polly</option>
                <option value="aliyun">Alibaba Cloud</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Avatar Provider
              </label>
              <select
                value={settings.output.avatar_provider}
                onChange={(e) => setSettings({
                  ...settings,
                  output: { ...settings.output, avatar_provider: e.target.value }
                })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="mock">Mock (Simulated)</option>
                <option value="did">D-ID</option>
                <option value="synthesia">Synthesia</option>
                <option value="heygen">HeyGen</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Language
              </label>
              <select
                value={settings.output.default_language}
                onChange={(e) => setSettings({
                  ...settings,
                  output: { ...settings.output, default_language: e.target.value }
                })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="zh-CN">Chinese (Simplified)</option>
                <option value="en-US">English (US)</option>
                <option value="ja-JP">Japanese</option>
                <option value="ko-KR">Korean</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">Auto-generate video output</div>
                <div className="text-sm text-gray-500 mt-1">
                  Automatically create video lessons with avatar
                </div>
              </div>
              <button
                onClick={() => setSettings({
                  ...settings,
                  output: { ...settings.output, auto_generate_video: !settings.output.auto_generate_video }
                })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.output.auto_generate_video ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.output.auto_generate_video ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Settings</h2>
          
          <div className="space-y-4">
            {Object.entries(settings.notifications).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900 capitalize">
                    {key.replace(/_/g, ' ')}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {key === 'email_alerts' && 'Receive email notifications'}
                    {key === 'cost_alerts' && 'Alert when approaching budget limit'}
                    {key === 'quality_alerts' && 'Alert for low quality lessons'}
                    {key === 'system_alerts' && 'System status and maintenance alerts'}
                  </div>
                </div>
                <button
                  onClick={() => setSettings({
                    ...settings,
                    notifications: { ...settings.notifications, [key]: !value }
                  })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    value ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    value ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Notification Email</h3>
            <input
              type="email"
              placeholder="your-email@example.com"
              className="w-full px-4 py-2 border border-blue-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-sm text-blue-700 mt-2">
              Notifications will be sent to this email address
            </p>
          </div>
        </div>
      )}
    </div>
  )
}