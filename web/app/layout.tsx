import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'MentorMind - AI Teaching Assistant',
  description: 'AI-driven educational agent for personalized teaching',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-slate-50">
          <header className="bg-white px-4 py-4 border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4">
              <div className="flex justify-between items-center h-16">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Link href="/" className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold">M</span>
                      </div>
                      <span className="text-xl font-bold text-gray-900">MentorMind</span>
                    </Link>
                  </div>
                </div>
                
                <nav className="hidden md:flex items-center space-x-6">
                  <Link href="/dashboard" className="text-gray-700 hover:text-gray-900 font-medium">
                    Dashboard
                  </Link>
                  <Link href="/lessons" className="text-gray-700 hover:text-gray-900 font-medium">
                    Lessons
                  </Link>
                  <Link href="/analytics" className="text-gray-700 hover:text-gray-900 font-medium">
                    Analytics
                  </Link>
                  <Link href="/settings" className="text-gray-700 hover:text-gray-900 font-medium">
                    Settings
                  </Link>
                  <Link href="/test" className="text-gray-500 hover:text-gray-700 text-sm">
                    Test
                  </Link>
                </nav>
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-4 py-8">
            {children}
          </main>
          <footer className="bg-white border-t border-gray-200 mt-12">
            <div className="max-w-7xl mx-auto px-4 py-6">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">
                  © 2024 MentorMind. All rights reserved.
                </div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}