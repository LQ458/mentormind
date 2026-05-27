'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const browserLang = detectBrowserLang()
    if (language !== browserLang) {
      setLanguage(browserLang)
    }
    setReady(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect signed-in users to study plan
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/study-plan')
    }
  }, [isLoaded, isSignedIn, router])

  const isRegister = inviteCode.trim().length > 0
  const canSubmit = username.trim().length >= 2 && password.trim().length >= 4 && (!isRegister || inviteCode.trim().length > 0)

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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      padding: '24px',
    }}>
      {/* Language toggle */}
      <div style={{ position: 'absolute', top: 80, right: 24 }}>
        <button
          onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
          style={{
            padding: '4px 12px',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            background: '#fff',
            fontSize: 13,
            cursor: 'pointer',
            color: '#6b7280',
          }}
        >
          {language === 'zh' ? 'EN' : '中文'}
        </button>
      </div>

      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
          MentorMind
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 32px' }}>
          {language === 'zh'
            ? 'AI 驱动的个性化学习平台'
            : 'AI-powered personalized learning'}
        </p>

        <form onSubmit={handleSubmit}>
          {/* Username */}
          <input
            type="text"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError('') }}
            placeholder={language === 'zh' ? '用户名' : 'Username'}
            autoFocus
            disabled={submitting}
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: 16,
              border: `1.5px solid ${error ? '#ef4444' : '#d1d5db'}`,
              borderRadius: 8,
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
            onBlur={(e) => (e.target.style.borderColor = error ? '#ef4444' : '#d1d5db')}
          />

          {/* Password */}
          <div style={{ position: 'relative', marginTop: 12 }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder={language === 'zh' ? '密码' : 'Password'}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '14px 44px 14px 16px',
                fontSize: 16,
                border: `1.5px solid ${error ? '#ef4444' : '#d1d5db'}`,
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
              onBlur={(e) => (e.target.style.borderColor = error ? '#ef4444' : '#d1d5db')}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                fontSize: 14,
                color: '#9ca3af',
              }}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>

          {/* Invite code (optional) */}
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => { setInviteCode(e.target.value); setError('') }}
            placeholder={language === 'zh' ? '邀请码（首次注册必填）' : 'Invite code (required for registration)'}
            disabled={submitting}
            style={{
              width: '100%',
              marginTop: 12,
              padding: '14px 16px',
              fontSize: 16,
              border: `1.5px solid ${error ? '#ef4444' : '#d1d5db'}`,
              borderRadius: 8,
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#3b82f6')}
            onBlur={(e) => (e.target.style.borderColor = error ? '#ef4444' : '#d1d5db')}
          />

          {error && (
            <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8, textAlign: 'left' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !canSubmit}
            style={{
              width: '100%',
              marginTop: 16,
              padding: '14px 0',
              fontSize: 16,
              fontWeight: 600,
              border: 'none',
              borderRadius: 8,
              background: submitting || !canSubmit ? '#93c5fd' : '#3b82f6',
              color: '#fff',
              cursor: submitting || !canSubmit ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {submitting
              ? (language === 'zh' ? '处理中...' : 'Processing...')
              : isRegister
                ? (language === 'zh' ? '注册并开始学习' : 'Register & Start')
                : (language === 'zh' ? '登录' : 'Login')}
          </button>
        </form>

        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 24 }}>
          {language === 'zh'
            ? '内测阶段，需邀请码注册'
            : 'Internal testing — invite code required for registration'}
        </p>
      </div>
    </div>
  )
}
