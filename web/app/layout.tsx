import type { Metadata } from 'next'
import './globals.css'
import { LanguageProvider } from './components/LanguageContext'
import { AuthProvider } from './components/AuthContext'
import { TweaksProvider } from './components/design/TweaksProvider'
import AppShell from './components/design/AppShell'
import TweaksPanel from './components/design/TweaksPanel'
import TelemetryBoot from './components/TelemetryBoot'
import { Toaster } from 'sonner'

export const metadata: Metadata = {
  title: 'MentorMind',
  description: 'AI-powered personalized learning platform',
  icons: {
    icon: '/favicon.jpg',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'MentorMind',
    'format-detection': 'telephone=no',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta name="theme-color" content="#F7F8FA" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthProvider>
          <LanguageProvider>
            <TweaksProvider>
              <TelemetryBoot />
              <AppShell>{children}</AppShell>
              <TweaksPanel />
              <Toaster
                position="top-right"
                richColors
                closeButton
                toastOptions={{
                  style: {
                    fontFamily: 'IBM Plex Sans, "PingFang SC", system-ui, sans-serif',
                  },
                }}
              />
            </TweaksProvider>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
