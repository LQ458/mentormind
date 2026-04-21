'use client'

import React from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useLanguage } from './LanguageContext'

interface ClerkAuthGateProps {
  children: React.ReactNode
  redirectTo?: string
}

/**
 * Wrap protected routes so we don't render — or open WebSockets — until
 * Clerk has finished priming the session. Without this gate, pages that
 * call `getToken()` immediately on mount race the Clerk initialization
 * and end up with `token=null`, which leaves the WS closed and the UI blank.
 */
export default function ClerkAuthGate({ children, redirectTo = '/auth/login' }: ClerkAuthGateProps) {
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()
  const { language } = useLanguage()

  React.useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace(redirectTo)
    }
  }, [isLoaded, isSignedIn, router, redirectTo])

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 gap-3">
        <div
          className="h-8 w-8 rounded-full border-2 border-slate-700 border-t-sky-400 animate-spin"
          aria-hidden
        />
        <p className="text-sm text-slate-300">
          {language === 'zh' ? '正在验证登录状态…' : 'Verifying your session…'}
        </p>
        <p className="text-xs text-slate-500">
          {language === 'zh'
            ? '请稍候，页面将在登录完成后自动加载。'
            : 'Hang tight — this page loads once Clerk finishes signing you in.'}
        </p>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 gap-3">
        <p className="text-sm text-slate-300">
          {language === 'zh' ? '请先登录后再访问此页面。' : 'Please sign in to continue.'}
        </p>
      </div>
    )
  }

  return <>{children}</>
}
