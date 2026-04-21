'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

export type Palette = 'cloud' | 'warm' | 'graphite' | 'midnight'
export type Accent = 'blue' | 'violet' | 'green' | 'rose'
export type Density = 'comfortable' | 'spacious'

export interface Tweaks {
  palette: Palette
  accent: Accent
  density: Density
}

interface TweaksCtx {
  tweaks: Tweaks
  setTweaks: (t: Tweaks) => void
  setPalette: (p: Palette) => void
  setAccent: (a: Accent) => void
  setDensity: (d: Density) => void
}

const DEFAULT_TWEAKS: Tweaks = {
  palette: 'cloud',
  accent: 'blue',
  density: 'comfortable',
}

const Ctx = createContext<TweaksCtx | undefined>(undefined)

export function TweaksProvider({ children }: { children: React.ReactNode }) {
  const [tweaks, setTweaksState] = useState<Tweaks>(DEFAULT_TWEAKS)
  const [mounted, setMounted] = useState(false)

  // Hydrate from localStorage only after mount to avoid SSR mismatch
  useEffect(() => {
    try {
      const raw = localStorage.getItem('mm:tweaks')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          setTweaksState({
            palette: parsed.palette || DEFAULT_TWEAKS.palette,
            accent: parsed.accent || DEFAULT_TWEAKS.accent,
            density: parsed.density || DEFAULT_TWEAKS.density,
          })
        }
      }
    } catch {
      // ignore
    }
    setMounted(true)
  }, [])

  // Reflect to body data attributes
  useEffect(() => {
    if (!mounted) return
    const body = document.body
    body.dataset.palette = tweaks.palette
    body.dataset.accent = tweaks.accent
    body.dataset.density = tweaks.density
    try {
      localStorage.setItem('mm:tweaks', JSON.stringify(tweaks))
    } catch {
      // ignore
    }
  }, [tweaks, mounted])

  const setTweaks = (t: Tweaks) => setTweaksState(t)
  const setPalette = (p: Palette) => setTweaksState((prev) => ({ ...prev, palette: p }))
  const setAccent = (a: Accent) => setTweaksState((prev) => ({ ...prev, accent: a }))
  const setDensity = (d: Density) => setTweaksState((prev) => ({ ...prev, density: d }))

  return (
    <Ctx.Provider value={{ tweaks, setTweaks, setPalette, setAccent, setDensity }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTweaks() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTweaks must be used within a TweaksProvider')
  return ctx
}
