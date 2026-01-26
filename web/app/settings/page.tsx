'use client'

import { useState } from 'react'

interface SubscriptionPlan {
  id: string
  name: string
  price: number
  features: string[]
  lessons_per_month: number
  max_duration: number
  support: string
}

interface UserSettings {
  subscription: {
    plan: string
    status: 'active' | 'cancelled' | 'pending'
    renewal_date: string
    usage: {
      lessons_used: number
      lessons_remaining: number
      cost_this_month: number
    }
  }
  preferences: {
    default_language: string
    auto_generate_video: boolean
    quality_threshold: number
    email_notifications: boolean
  }
  billing: {
    email: string
    payment_method: string
    billing_address: string
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings>({
    subscription: {
      plan: 'pro',
      status: 'active',
      renewal_date: '2026-02-23',
      usage: {
        lessons_used: 42,
        lessons_remaining: 958,
        cost_this_month: 3.42,
      },
    },
    preferences: {
      default_language: 'zh-CN',
      auto_generate_video: true,
      quality_threshold: 0.8,
      email_notifications: true,
    },
    billing: {
      email: 'user@example.com',
      payment_method: 'visa-4242',
      billing_address: '123 Main St, Shanghai, China',
    },
  })

  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('subscription')

  const subscriptionPlans: SubscriptionPlan[] = [
    {
      id: 'basic',
      name: 'Basic',
      price: 9.99,
      features: ['100 lessons/month', '30min max duration', 'Email support', 'Standard quality'],
      lessons_per_month: 100,
      max_duration: 30,
      support: 'email',
    },
    {
      id: 'pro',
      name: 'Professional',
      price: 29.99,
      features: ['1000 lessons/month', '60min max duration', 'Priority support', 'High quality', 'Video generation'],
      lessons_per_month: 1000,
      max_duration: 60,
      support: 'priority',
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 99.99,
      features: ['Unlimited lessons', 'Unlimited duration', '24/7 support', 'Highest quality', 'Custom avatars', 'API access'],
      lessons_per_month: 9999,
      max_duration: 120,
      support: '24/7',
    },
  ]

  const handleSave = async () => {
    setSaving(true)
    try {
      // In a real implementation, this would save to the backend
      await new Promise(resolve => setTimeout(resolve, 1000))
      alert('Settings saved successfully!')
    } catch (error) {
      console.error('Failed to save settings:', error)
      alert('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleUpgrade = (planId: string) => {
    if (confirm(`Upgrade to ${planId} plan? This will take effect on your next billing cycle.`)) {
      setSettings({
        ...settings,
        subscription: {
          ...settings.subscription,
          plan: planId,
        },
      })
      alert('Plan upgrade requested!')
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
          <p className="text-gray-600 mt-1">Manage your subscription and preferences</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'subscription', label: 'Subscription' },
            { id: 'preferences', label: 'Preferences' },
            { id: 'billing', label: 'Billing' },
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

      {/* Subscription Tab */}
      {activeTab === 'subscription' && (
        <div className="space-y-6">
          {/* Current Plan */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Plan</h2>
            
            <div className="bg-blue-50 rounded-lg p-6 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center mb-2">
                    <span className="text-2xl font-bold text-gray-900">
                      {subscriptionPlans.find(p => p.id === settings.subscription.plan)?.name}
                    </span>
                    <span className="ml-3 px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                      {settings.subscription.status}
                    </span>
                  </div>
                  <p className="text-gray-600">
                    ${subscriptionPlans.find(p => p.id === settings.subscription.plan)?.price}/month
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Renews on</div>
                  <div className="font-medium text-gray-900">{settings.subscription.renewal_date}</div>
                </div>
              </div>
            </div>

            {/* Usage Stats */}
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Lessons Used</div>
                <div className="text-2xl font-bold text-gray-900">{settings.subscription.usage.lessons_used}</div>
                <div className="text-sm text-gray-500 mt-1">
                  of {subscriptionPlans.find(p => p.id === settings.subscription.plan)?.lessons_per_month} this month
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Remaining</div>
                <div className="text-2xl font-bold text-gray-900">{settings.subscription.usage.lessons_remaining}</div>
                <div className="text-sm text-gray-500 mt-1">lessons available</div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Cost This Month</div>
                <div className="text-2xl font-bold text-gray-900">${settings.subscription.usage.cost_this_month.toFixed(2)}</div>
                <div className="text-sm text-gray-500 mt-1">based on usage</div>
              </div>
            </div>

            {/* Plan Features */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Plan Features</h3>
              <div className="space-y-2">
                {subscriptionPlans.find(p => p.id === settings.subscription.plan)?.features.map((feature, index) => (
                  <div key={index} className="flex items-center">
                    <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Upgrade Plans */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Available Plans</h2>
            
            <div className="grid md:grid-cols-3 gap-6">
              {subscriptionPlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`border rounded-xl p-6 ${
                    settings.subscription.plan === plan.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="mb-4">
                    <div className="text-lg font-semibold text-gray-900">{plan.name}</div>
                    <div className="text-3xl font-bold text-gray-900 mt-2">${plan.price}<span className="text-lg text-gray-600">/month</span></div>
                  </div>
                  
                  <div className="space-y-3 mb-6">
                    {plan.features.map((feature, index) => (
                      <div key={index} className="flex items-center">
                        <svg className="w-5 h-5 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-gray-700">{feature}</span>
                      </div>
                    ))}
                  </div>
                  
                  {settings.subscription.plan === plan.id ? (
                    <button
                      disabled
                      className="w-full py-3 bg-gray-100 text-gray-400 rounded-lg font-medium cursor-not-allowed"
                    >
                      Current Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                    >
                      {settings.subscription.plan === 'basic' && plan.id === 'pro' ? 'Upgrade' : 'Switch to Plan'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Cancel Subscription */}
          <div className="bg-red-50 rounded-xl border border-red-200 p-6">
            <h3 className="text-lg font-semibold text-red-900 mb-3">Danger Zone</h3>
            <p className="text-red-700 mb-4">
              Cancelling your subscription will stop auto-renewal. You'll still have access until the end of your billing period.
            </p>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to cancel your subscription?')) {
                  setSettings({
                    ...settings,
                    subscription: {
                      ...settings.subscription,
                      status: 'cancelled',
                    },
                  })
                  alert('Subscription cancellation requested.')
                }
              }}
              className="px-6 py-2 bg-white text-red-600 border border-red-300 rounded-lg font-medium hover:bg-red-50 transition-colors"
            >
              Cancel Subscription
            </button>
          </div>
        </div>
      )}

      {/* Preferences Tab */}
      {activeTab === 'preferences' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Preferences</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Language
              </label>
              <select
                value={settings.preferences.default_language}
                onChange={(e) => setSettings({
                  ...settings,
                  preferences: { ...settings.preferences, default_language: e.target.value }
                })}
                className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="zh-CN">Chinese (Simplified)</option>
                <option value="en-US">English (US)</option>
                <option value="ja-JP">Japanese</option>
                <option value="ko-KR">Korean</option>
              </select>
              <p className="text-sm text-gray-500 mt-2">
                Default language for generated lesson content
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Quality Threshold
              </label>
              <div className="flex items-center">
                <input
                  type="range"
                  value={settings.preferences.quality_threshold * 100}
                  onChange={(e) => setSettings({
                    ...settings,
                    preferences: { ...settings.preferences, quality_threshold: parseInt(e.target.value) / 100 }
                  })}
                  className="w-full"
                  min="60"
                  max="95"
                />
                <span className="ml-4 w-16 text-right font-medium">
                  {(settings.preferences.quality_threshold * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                Lessons below this score will be flagged for review
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">Auto-generate video lessons</div>
                  <div className="text-sm text-gray-500 mt-1">
                    Automatically create video output with avatar
                  </div>
                </div>
                <button
                  onClick={() => setSettings({
                    ...settings,
                    preferences: { ...settings.preferences, auto_generate_video: !settings.preferences.auto_generate_video }
                  })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.preferences.auto_generate_video ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.preferences.auto_generate_video ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">Email notifications</div>
                  <div className="text-sm text-gray-500 mt-1">
                    Receive email updates about your lessons and usage
                  </div>
                </div>
                <button
                  onClick={() => setSettings({
                    ...settings,
                    preferences: { ...settings.preferences, email_notifications: !settings.preferences.email_notifications }
                  })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.preferences.email_notifications ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.preferences.email_notifications ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Billing Tab */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Billing Information</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Billing Email
                </label>
                <input
                  type="email"
                  value={settings.billing.email}
                  onChange={(e) => setSettings({
                    ...settings,
                    billing: { ...settings.billing, email: e.target.value }
                  })}
                  className="w-full md:w-96 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-sm text-gray-500 mt-2">
                  Invoices and receipts will be sent to this email
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Method
                </label>
                <div className="flex items-center p-4 bg-gray-50 rounded-lg">
                  <div className="w-10 h-6 bg-blue-500 rounded mr-4"></div>
                  <div>
                    <div className="font-medium text-gray-900">Visa ending in 4242</div>
                    <div className="text-sm text-gray-500">Expires 12/2026</div>
                  </div>
                  <button className="ml-auto text-blue-600 hover:text-blue-800 font-medium">
                    Update
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Billing Address
                </label>
                <textarea
                  value={settings.billing.billing_address}
                  onChange={(e) => setSettings({
                    ...settings,
                    billing: { ...settings.billing, billing_address: e.target.value }
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Billing History</h2>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {[
                    { date: '2026-01-23', description: 'Professional Plan', amount: 29.99, status: 'Paid' },
                    { date: '2025-12-23', description: 'Professional Plan', amount: 29.99, status: 'Paid' },
                    { date: '2025-11-23', description: 'Professional Plan', amount: 29.99, status: 'Paid' },
                    { date: '2025-10-23', description: 'Basic to Professional Upgrade', amount: 20.00, status: 'Paid' },
                    { date: '2025-10-23', description: 'Basic Plan', amount: 9.99, status: 'Paid' },
                  ].map((invoice, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 text-sm text-gray-900">{invoice.date}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{invoice.description}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">${invoice.amount.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                          {invoice.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}