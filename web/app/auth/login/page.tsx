'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../components/AuthContext'
import { useLanguage } from '../../components/LanguageContext'

function getRedirectTarget(): string {
  if (typeof window === 'undefined') return '/study-plan'
  const target = new URLSearchParams(window.location.search).get('redirect') || '/study-plan'
  if (!target.startsWith('/') || target.startsWith('//')) return '/study-plan'
  return target
}

function getInviteCodeFromUrl(): string {
  if (typeof window === 'undefined') return ''
  const params = new URLSearchParams(window.location.search)
  return (
    params.get('invite') ||
    params.get('invite_code') ||
    params.get('code') ||
    ''
  ).trim()
}

export default function LoginPage() {
  const { isLoaded, isSignedIn, loginWithInvite } = useAuth()
  const { language } = useLanguage()
  const [inviteCode, setInviteCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    window.location.replace(getRedirectTarget())
  }, [isLoaded, isSignedIn])

  useEffect(() => {
    const code = getInviteCodeFromUrl()
    if (code) setInviteCode(code)
  }, [])

  const isRegister = inviteCode.trim().length > 0
  const canSubmit = username.trim().length >= 2 && password.trim().length >= 4

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
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
    if (new TextEncoder().encode(pwd).length > 72) {
      setError(language === 'zh' ? '密码最多 72 bytes' : 'Password must be at most 72 bytes')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      await loginWithInvite(code || undefined, uname, pwd, language)
      window.location.assign(getRedirectTarget())
    } catch (err: any) {
      const msg = err?.message || ''
      if (msg.includes('403') || msg.includes('Invalid invite')) {
        setError(language === 'zh' ? '邀请码无效' : 'Invalid invite code')
      } else if (msg.includes('limit')) {
        setError(language === 'zh' ? '邀请码已达使用上限' : 'Invite code has reached its usage limit')
      } else if (msg.includes('409') || msg.includes('taken')) {
        setError(language === 'zh' ? '用户名已被占用' : 'Username already taken')
      } else if (msg.includes('2-40') || msg.includes('letters, numbers')) {
        setError(
          language === 'zh'
            ? '用户名需 2-40 个字符，只能使用字母、数字、点、短横线或下划线'
            : 'Username must be 2-40 characters: letters, numbers, dot, dash, or underscore',
        )
      } else if (msg.includes('72 bytes')) {
        setError(language === 'zh' ? '密码最多 72 bytes' : 'Password must be at most 72 bytes')
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

  return (
    <main className="mx-auto flex min-h-[calc(100vh-150px)] w-full max-w-[460px] flex-col justify-center px-5 py-10">
      <div className="rounded-lg border border-[var(--line)] bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-normal text-[var(--ink-muted)]">
            {language === 'zh' ? '测试登录' : 'Tester sign in'}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--ink)]">
            {language === 'zh' ? '进入 MentorMind' : 'Enter MentorMind'}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value)
              setError('')
            }}
            placeholder={language === 'zh' ? '用户名' : 'Username'}
            autoComplete="username"
            disabled={submitting}
            maxLength={40}
            className="h-12 w-full rounded-lg border border-[var(--line-strong)] bg-white px-4 text-base outline-none transition focus:border-[var(--accent)]"
          />

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setError('')
              }}
              placeholder={language === 'zh' ? '密码' : 'Password'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              disabled={submitting}
              maxLength={72}
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
            onChange={(event) => {
              setInviteCode(event.target.value)
              setError('')
            }}
            placeholder={language === 'zh' ? '邀请码（首次注册）' : 'Invite code for first-time registration'}
            autoComplete="one-time-code"
            disabled={submitting}
            className="h-12 w-full rounded-lg border border-[var(--line-strong)] bg-white px-4 text-base outline-none transition focus:border-[var(--accent)]"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? (language === 'zh' ? '处理中...' : 'Processing...')
              : isRegister
                ? (language === 'zh' ? '注册并开始' : 'Register and start')
                : (language === 'zh' ? '登录并开始' : 'Sign in and start')}
            {!submitting && <ArrowRight size={16} />}
          </button>
        </form>
      </div>
    </main>
  )
}
