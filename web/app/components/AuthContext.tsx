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
  signOut: () => Promise<void>
}

const AuthCtx = createContext<AuthContextValue>({
  user: null,
  isLoaded: false,
  isSignedIn: false,
  getToken: async () => null,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const tokenRef = React.useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/auth/get-session', { credentials: 'include' })
        if (!res.ok || cancelled) {
          setIsLoaded(true)
          return
        }
        const data = await res.json()
        if (data?.user && !cancelled) {
          const u = data.user
          setUser({
            id: u.id || '',
            email: u.email || '',
            firstName: u.name?.split(' ')[0] || '',
            username: u.email?.split('@')[0] || u.name || '',
            fullName: u.name || u.email || '',
          })
        }
        // Populate token from the JWT cookie (httpOnly, can only read server-side)
        try {
          const tokenRes = await fetch('/api/token', { credentials: 'include' })
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json()
            if (tokenData?.token) tokenRef.current = tokenData.token
          }
        } catch { /* token endpoint may not be available in all environments */ }
      } catch {
        // Not signed in or server unreachable — that's fine
      } finally {
        if (!cancelled) setIsLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const getToken = useCallback(async (): Promise<string | null> => {
    if (tokenRef.current) return tokenRef.current
    try {
      const res = await fetch('/api/token', { credentials: 'include' })
      if (!res.ok) return null
      const data = await res.json()
      const t = data?.token || null
      if (t) tokenRef.current = t
      return t
    } catch {
      return null
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    try {
      await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore
    }
    setUser(null)
    tokenRef.current = null
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoaded,
      isSignedIn: !!user,
      getToken,
      signOut: handleSignOut,
    }),
    [user, isLoaded, getToken, handleSignOut],
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