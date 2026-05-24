'use client'

import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useEffect,
  useState,
} from 'react'
import { authClient, useSession } from '@/lib/auth-client'

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

function mapUser(raw: Record<string, unknown> | null | undefined): AuthUser | null {
  if (!raw) return null
  const email = (raw.email || '') as string
  const name = (raw.name || '') as string
  return {
    id: (raw.id || '') as string,
    email,
    firstName: name.split(' ')[0] || '',
    username: email.split('@')[0] || name || '',
    fullName: name || email || '',
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession()
  const [cachedToken, setCachedToken] = useState<string | null>(null)

  const sessionUser = data?.user as Record<string, unknown> | undefined
  const user = useMemo(() => mapUser(sessionUser), [sessionUser])

  const isLoaded = !isPending
  const isSignedIn = !isPending && !!data

  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      const result = await authClient.getSession()
      if (!result?.data?.session) return null
      const sess = result.data.session as Record<string, unknown>
      const token = (sess.token || sess.sessionToken) as string | undefined
      if (token) {
        setCachedToken(token)
        return token
      }
      return null
    } catch {
      return cachedToken
    }
  }, [cachedToken])

  const handleSignOut = useCallback(async () => {
    await authClient.signOut()
    setCachedToken(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoaded, isSignedIn, getToken, signOut: handleSignOut }),
    [user, isLoaded, isSignedIn, getToken, handleSignOut],
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
    getToken().then((token) => {
      if (!cancelled && token) {
        setHeaders({ Authorization: `Bearer ${token}` })
      }
    })
    return () => { cancelled = true }
  }, [isSignedIn, getToken])

  return headers
}
