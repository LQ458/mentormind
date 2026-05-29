'use client'

import { useEffect, useRef, useState } from 'react'

interface UseLocalStorageDraftOptions<T> {
  key: string
  initialValue: T
  debounceMs?: number
  shouldPersist?: (value: T) => boolean
}

interface DraftEnvelope<T> {
  value: T
  savedAt: number
}

export function useLocalStorageDraft<T>(options: UseLocalStorageDraftOptions<T>) {
  const { key, initialValue, debounceMs = 1500, shouldPersist } = options
  const [value, setValue] = useState<T>(initialValue)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      setHydrated(true)
      return
    }
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const env = JSON.parse(raw) as DraftEnvelope<T>
        if (env && typeof env === 'object' && 'value' in env) {
          setValue(env.value)
          setSavedAt(env.savedAt)
        }
      }
    } catch (err) {
      console.warn('[useLocalStorageDraft] hydration failed', err)
    }
    setHydrated(true)
  }, [key])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    if (shouldPersist && !shouldPersist(value)) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try {
        const envelope: DraftEnvelope<T> = { value, savedAt: Date.now() }
        window.localStorage.setItem(key, JSON.stringify(envelope))
        setSavedAt(envelope.savedAt)
      } catch (err) {
        console.warn('[useLocalStorageDraft] save failed', err)
      }
    }, debounceMs)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, hydrated, key, debounceMs, shouldPersist])

  const clearDraft = () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(key)
      } catch {}
    }
    setSavedAt(null)
  }

  return { value, setValue, savedAt, hydrated, clearDraft }
}
