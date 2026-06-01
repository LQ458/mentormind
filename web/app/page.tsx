'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from './components/AuthContext'
import { useLanguage } from './components/LanguageContext'

function detectBrowserLang(): 'zh' | 'en' {
  if (typeof window === 'undefined') return 'zh'
  const nav = window.navigator.language || ''
  return nav.startsWith('zh') ? 'zh' : 'en'
}

export default function HomePage() {
  const { isLoaded, isSignedIn, loginWithInvite } = useAuth()
  const { language, setLanguage } = useLanguage()
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const browserLang = detectBrowserLang()
    if (language !== browserLang) setLanguage(browserLang)
    setReady(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startLearning = () => {
    if (isSignedIn) {
      router.push('/study-plan')
      return
    }
    setShowAuth(true)
  }

  const isRegister = inviteCode.trim().length > 0
  const canSubmit =
    username.trim().length >= 2 &&
    password.trim().length >= 4 &&
    (!isRegister || inviteCode.trim().length > 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const uname = username.trim()
    const pwd = password.trim()
    const code = inviteCode.trim()

    if (uname.length < 2) {
      setError(language === 'zh' ? '用户名至少2个字符' : 'Username must be at least 2 characters')
      return
    }
    if (pwd.length < 4) {
      setError(language === 'zh' ? '密码至少4个字符' : 'Password must be at least 4 characters')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      await loginWithInvite(code || undefined, uname, pwd, language)
      router.push('/study-plan')
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.includes('403') || msg.includes('Invalid invite')) {
        setError(language === 'zh' ? '邀请码无效' : 'Invalid invite code')
      } else if (msg.includes('limit')) {
        setError(language === 'zh' ? '邀请码已达使用上限' : 'Invite code has reached its usage limit')
      } else if (msg.includes('409') || msg.includes('taken')) {
        setError(language === 'zh' ? '用户名已被占用' : 'Username already taken')
      } else if (msg.includes('401') || msg.includes('not found') || msg.includes('Incorrect')) {
        setError(language === 'zh' ? '用户名或密码错误' : 'Incorrect username or password')
      } else if (msg.includes('429') || msg.includes('rate')) {
        setError(language === 'zh' ? '请求太频繁，请稍后再试' : 'Too many attempts. Please wait a moment.')
      } else {
        setError(language === 'zh' ? '连接失败，请检查网络' : 'Connection failed. Check your network.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!isLoaded || !ready) return null

  return (
    <main className="min-h-[calc(100vh-64px)] flex items-center justify-center px-5 py-12">
      <div className="absolute right-5 top-20 sm:right-8">
        <div className="lang-toggle" role="group" aria-label="Language">
          <button
            type="button"
            className={language === 'en' ? 'on' : ''}
            onClick={() => setLanguage('en')}
          >
            EN
          </button>
          <button
            type="button"
            className={language === 'zh' ? 'on' : ''}
            onClick={() => setLanguage('zh')}
          >
            中文
          </button>
        </div>
      </div>

      <div className="w-full max-w-[420px] text-center">
        <h1 className="font-[var(--display)] text-[44px] sm:text-[56px] leading-none font-medium tracking-normal text-[var(--ink)]">
          MentorMind
        </h1>

        {!showAuth && (
          <button
            type="button"
            onClick={startLearning}
            className="mt-10 inline-flex h-12 min-w-[168px] items-center justify-center rounded-lg bg-[var(--ink)] px-6 text-sm font-semibold text-[var(--bg)] shadow-sm transition hover:opacity-90"
          >
            {language === 'zh' ? '开始学习' : 'Start learning'}
          </button>
        )}

        {showAuth && (
          <form onSubmit={handleSubmit} className="mt-10 space-y-3 text-left">
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError('') }}
              placeholder={language === 'zh' ? '用户名' : 'Username'}
              autoFocus
              disabled={submitting}
              className="h-12 w-full rounded-lg border border-[var(--line-strong)] bg-white px-4 text-base outline-none transition focus:border-[var(--accent)]"
            />

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                placeholder={language === 'zh' ? '密码' : 'Password'}
                disabled={submitting}
                className="h-12 w-full rounded-lg border border-[var(--line-strong)] bg-white px-4 pr-12 text-base outline-none transition focus:border-[var(--accent)]"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            <input
              type="text"
              value={inviteCode}
              onChange={(e) => { setInviteCode(e.target.value); setError('') }}
              placeholder={language === 'zh' ? '邀请码（首次注册）' : 'Invite code for registration'}
              disabled={submitting}
              className="h-12 w-full rounded-lg border border-[var(--line-strong)] bg-white px-4 text-base outline-none transition focus:border-[var(--accent)]"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="h-12 w-full rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? (language === 'zh' ? '处理中...' : 'Processing...')
                : isRegister
                  ? (language === 'zh' ? '注册并开始' : 'Register and start')
                  : (language === 'zh' ? '登录并开始' : 'Sign in and start')}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
