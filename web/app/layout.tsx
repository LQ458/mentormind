import type { Metadata } from 'next'
import './globals.css'
import { LanguageProvider } from './components/LanguageContext'
import { ClerkProvider } from '@clerk/nextjs'
import { TweaksProvider } from './components/design/TweaksProvider'
import AppShell from './components/design/AppShell'
import TweaksPanel from './components/design/TweaksPanel'

export const metadata: Metadata = {
  title: 'MentorMind - AI Teaching Assistant',
  description: 'Process-first AI learning system with spaced review, seminar learning, and simulation-based practice',
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
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <html lang="zh-CN">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link
            href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap"
            rel="stylesheet"
          />
        </head>
        <body>
          <LanguageProvider>
            <TweaksProvider>
              <AppShell>{children}</AppShell>
              <TweaksPanel />
            </TweaksProvider>
          </LanguageProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
