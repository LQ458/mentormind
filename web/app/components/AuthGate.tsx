'use client'

import React, { useEffect } from 'react'
import { useAuth } from './AuthContext'
import { useRouter } from 'next/navigation'
import { useLanguage } from './LanguageContext'

interface AuthGateProps {
  children: React.ReactNode
  redirectTo?: string
}

export default function AuthGate({ children, redirectTo = '/auth/login' }: AuthGateProps) {
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()
  const { language } = useLanguage()

  useEffect(() => {
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
            : 'Hang tight — this page loads once your session is verified.'}
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
