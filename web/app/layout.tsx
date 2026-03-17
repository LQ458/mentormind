import type { Metadata } from 'next'
import './globals.css'
import { LanguageProvider } from './components/LanguageContext'
import { ClerkProvider } from '@clerk/nextjs'
import Navbar from './components/Navbar'

export const metadata: Metadata = {
  title: 'MentorMind - AI Teaching Assistant',
  description: 'AI-driven educational agent for personalized teaching',
  icons: {
    icon: '/favicon.jpg',
    apple: '/icon.jpg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
    <ClerkProvider>
      <html lang="zh-CN">
        <body>
            <LanguageProvider>
              <div className="min-h-screen bg-slate-50">
                <Navbar />
                <main className="max-w-7xl mx-auto px-4 py-8">
                  {children}
                </main>
                <footer className="bg-white border-t border-gray-200 mt-12">
                  <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-gray-500">
                        © {new Date().getFullYear()} MentorMind. All rights reserved.
                      </div>
                    </div>
                  </div>
                </footer>
              </div>
            </LanguageProvider>
        </body>
      </html>
    </ClerkProvider>
}