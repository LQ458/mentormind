'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

export type BoardFontSize = 'small' | 'medium' | 'large'

export interface BoardDisplayPrefs {
  fontSize: BoardFontSize
  highContrast: boolean
}

const STORAGE_KEY = 'board-display-prefs'

const DEFAULT_PREFS: BoardDisplayPrefs = {
  fontSize: 'medium',
  highContrast: false,
}

export function loadBoardPrefs(): BoardDisplayPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw)
    return {
      fontSize: ['small', 'medium', 'large'].includes(parsed.fontSize) ? parsed.fontSize : 'medium',
      highContrast: Boolean(parsed.highContrast),
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export function useBoardDisplayPrefs() {
  const [prefs, setPrefs] = useState<BoardDisplayPrefs>(DEFAULT_PREFS)
  const hydrated = useRef(false)

  useEffect(() => {
    setPrefs(loadBoardPrefs())
    hydrated.current = true
  }, [])

  useEffect(() => {
    if (!hydrated.current) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch {}
  }, [prefs])

  return [prefs, setPrefs] as const
}

export function boardFontScaleStyle(prefs: BoardDisplayPrefs): React.CSSProperties {
  const scale = prefs.fontSize === 'small' ? 0.9 : prefs.fontSize === 'large' ? 1.15 : 1
  return {
    ['--board-font-scale' as any]: scale,
    fontSize: `calc(1em * ${scale})`,
  }
}

interface Props {
  prefs: BoardDisplayPrefs
  onChange: (next: BoardDisplayPrefs) => void
  language: 'en' | 'zh'
}

export default function BoardDisplaySettings({ prefs, onChange, language }: Props) {
  const [open, setOpen] = useState(false)
  const trapRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: () => setOpen(false) })

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (trapRef.current && !trapRef.current.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open, trapRef])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700 flex items-center gap-1"
        aria-label={language === 'zh' ? '显示设置' : 'Display settings'}
        aria-expanded={open}
      >
        <span aria-hidden>⚙</span>
        {language === 'zh' ? '显示' : 'Display'}
      </button>
      {open && (
        <div
          ref={trapRef}
          tabIndex={-1}
          role="dialog"
          aria-label={language === 'zh' ? '显示设置' : 'Display settings'}
          className="absolute right-0 top-full mt-2 w-64 z-50 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur p-4 shadow-2xl focus:outline-none"
        >
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
              {language === 'zh' ? '字号' : 'Font size'}
            </div>
            <div className="flex gap-1">
              {(['small', 'medium', 'large'] as BoardFontSize[]).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => onChange({ ...prefs, fontSize: size })}
                  className={`flex-1 px-2 py-1.5 rounded-md border text-xs ${
                    prefs.fontSize === size
                      ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                      : 'border-slate-600 text-slate-300 hover:bg-slate-800'
                  }`}
                  aria-pressed={prefs.fontSize === size}
                >
                  {size === 'small' ? 'A−' : size === 'large' ? 'A+' : 'A'}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-xs text-slate-200">
              {language === 'zh' ? '高对比度' : 'High contrast'}
            </span>
            <input
              type="checkbox"
              checked={prefs.highContrast}
              onChange={(e) => onChange({ ...prefs, highContrast: e.target.checked })}
              className="accent-sky-500 h-4 w-4"
            />
          </label>
        </div>
      )}
    </div>
  )
}
