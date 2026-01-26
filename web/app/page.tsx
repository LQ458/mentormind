import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          MentorMind AI Teaching Assistant
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          AI-driven educational agent for personalized teaching in the Chinese market
        </p>
        <div className="mt-8 flex gap-4">
          <Link
            href="/create"
            className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            开始创建课程
            <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center px-6 py-3 bg-white text-gray-700 border border-gray-300 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            查看仪表板
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">AI-Powered Lessons</h3>
          <p className="text-gray-600">
            Generate personalized lesson plans using DeepSeek AI with Chinese market optimization
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Speech & Text Processing</h3>
          <p className="text-gray-600">
            Integrated FunASR for Chinese speech recognition and PaddleOCR for text extraction
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Subscription Plans</h3>
          <p className="text-gray-600">
            Simple monthly plans from $9.99 to $99.99 with predictable pricing
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Quick Access</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/create"
            className="bg-white rounded-lg p-4 text-center border border-gray-200 hover:border-blue-500 hover:shadow-sm transition-all"
          >
            <div className="text-blue-600 font-medium">创建课程</div>
            <div className="text-sm text-gray-500 mt-1">AI生成教学</div>
          </Link>
          
          <Link
            href="/lessons"
            className="bg-white rounded-lg p-4 text-center border border-gray-200 hover:border-blue-500 hover:shadow-sm transition-all"
          >
            <div className="text-blue-600 font-medium">课程管理</div>
            <div className="text-sm text-gray-500 mt-1">查看与编辑</div>
          </Link>
          
          <Link
            href="/analytics"
            className="bg-white rounded-lg p-4 text-center border border-gray-200 hover:border-blue-500 hover:shadow-sm transition-all"
          >
            <div className="text-blue-600 font-medium">Analytics</div>
            <div className="text-sm text-gray-500 mt-1">Usage & costs</div>
          </Link>
          
          <Link
            href="/settings"
            className="bg-white rounded-lg p-4 text-center border border-gray-200 hover:border-blue-500 hover:shadow-sm transition-all"
          >
            <div className="text-blue-600 font-medium">Settings</div>
            <div className="text-sm text-gray-500 mt-1">Configuration</div>
          </Link>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">System Status</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              <span className="font-medium">Backend API</span>
            </div>
            <span className="text-green-600 font-medium">Online</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              <span className="font-medium">DeepSeek API</span>
            </div>
            <span className="text-green-600 font-medium">Connected</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
              <span className="font-medium">FunASR Service</span>
            </div>
            <span className="text-yellow-600 font-medium">Simulated</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
              <span className="font-medium">PaddleOCR Service</span>
            </div>
            <span className="text-yellow-600 font-medium">Simulated</span>
          </div>
        </div>
      </div>
    </div>
  )
}