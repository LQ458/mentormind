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
          <h3 className="text-lg font-semibold text-gray-900 mb-2">AI-Powered Lessons</h3>
          <p className="text-gray-600">
            Generate personalized lesson plans using DeepSeek AI with Chinese market optimization
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Speech & Text Processing</h3>
          <p className="text-gray-600">
            Integrated FunASR for Chinese speech recognition and PaddleOCR for text extraction
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
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