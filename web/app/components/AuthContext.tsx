'use client'

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useEffect,
  useState,
} from 'react'

export interface AuthUser {
  id: string
  email: string
  firstName: string
  username: string
  fullName: string
}

interface AuthContextValue {
  user: AuthUser | null
  isLoaded: boolean
  isSignedIn: boolean
  getToken: () => Promise<string | null>
  signOut: () => void
  loginWithInvite: (inviteCode: string | undefined, username: string, password: string, lang?: string) => Promise<AuthUser>
}

const AuthCtx = createContext<AuthContextValue>({
  user: null,
  isLoaded: false,
  isSignedIn: false,
  getToken: async () => null,
  signOut: () => {},
  loginWithInvite: async () => {
    throw new Error('AuthContext not mounted')
  },
})

const TOKEN_KEY = 'mm_token'
const USER_KEY = 'mm_user'

function shouldPersistBearerToken(): boolean {
  return process.env.NODE_ENV !== 'production'
}

function toAuthUser(data: any): AuthUser | null {
  if (!data?.id) return null
  const username = String(data.username || '')
  const fullName = String(data.full_name || data.fullName || username || '')
  const firstName = String(data.first_name || data.firstName || fullName || username || '')
  return {
    id: String(data.id),
    username,
    email: String(data.email || (username ? `${username}@mentormind.local` : '')),
    firstName,
    fullName,
  }
}

function clearSessionCookie() {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const persistBearerToken = shouldPersistBearerToken()
        const token = persistBearerToken ? localStorage.getItem(TOKEN_KEY) : null
        if (!persistBearerToken) localStorage.removeItem(TOKEN_KEY)
        const savedUser = localStorage.getItem(USER_KEY)
        if (token && savedUser) {
          const parsedUser = JSON.parse(savedUser)
          if (!cancelled) setUser(parsedUser)
          if (!cancelled) setIsLoaded(true)
          return
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      }

      try {
        const res = await fetch('/api/backend/users/me', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        const hydratedUser = toAuthUser(data)
        if (!cancelled && hydratedUser) setUser(hydratedUser)
      } catch {
        // Missing or expired HttpOnly session; stay signed out.
      } finally {
        if (!cancelled) setIsLoaded(true)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const loginWithInvite = useCallback(
    async (inviteCode: string | undefined, username: string, password: string, lang?: string): Promise<AuthUser> => {
      const body: Record<string, string> = { username, password }
      if (inviteCode) body.invite_code = inviteCode
      if (lang) body.language = lang

      const res = await fetch('/api/backend/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as any)?.detail || `Auth failed (${res.status})`)
      }
      const data = await res.json()
      if (!data?.success || !data?.token) {
        throw new Error('Invalid response from server')
      }
      const u: AuthUser = {
        id: data.user?.id || '',
        username: data.user?.username || '',
        email: data.user?.username
          ? `${data.user.username}@mentormind.local`
          : '',
        firstName: data.user?.username || '',
        fullName: data.user?.username || '',
      }
      if (shouldPersistBearerToken()) {
        localStorage.setItem(TOKEN_KEY, data.token)
      } else {
        localStorage.removeItem(TOKEN_KEY)
      }
      localStorage.setItem(USER_KEY, JSON.stringify(u))
      setUser(u)
      return u
    },
    [],
  )

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!shouldPersistBearerToken()) return null
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/backend/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      clearSessionCookie()
    } catch {
      // ignore
    }
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoaded,
      isSignedIn: !!user,
      getToken,
      signOut,
      loginWithInvite,
    }),
    [user, isLoaded, getToken, signOut, loginWithInvite],
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth(): AuthContextValue {
  return useContext(AuthCtx)
}

export function useUser(): { user: AuthUser | null; isLoaded: boolean } {
  const { user, isLoaded } = useAuth()
  return { user, isLoaded }
}

export function useAuthHeaders(): Record<string, string> {
  const { isSignedIn, getToken } = useAuth()
  const [headers, setHeaders] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isSignedIn) {
      setHeaders({})
      return
    }
    let cancelled = false
    void getToken().then((t) => {
      if (!cancelled && t) {
        setHeaders({ Authorization: `Bearer ${t}` })
      }
    })
    return () => { cancelled = true }
  }, [isSignedIn, getToken])

  return headers
}
