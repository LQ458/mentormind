'use client'

import { useEffect, useRef } from 'react'

export interface ShortcutSpec {
  key: string
  meta?: boolean
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  description?: string
  preventDefault?: boolean
  ignoreInputs?: boolean
}

export type ShortcutHandler = (e: KeyboardEvent) => void

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

function matchesSpec(e: KeyboardEvent, spec: ShortcutSpec): boolean {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  const want = spec.key.length === 1 ? spec.key.toLowerCase() : spec.key
  if (key !== want) return false
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const metaOrCtrl = isMac ? e.metaKey : e.ctrlKey
  if (spec.meta && !metaOrCtrl) return false
  if (spec.ctrl && !e.ctrlKey) return false
  if (spec.shift && !e.shiftKey) return false
  if (spec.alt && !e.altKey) return false
  return true
}

export function useKeyboardShortcut(spec: ShortcutSpec, handler: ShortcutHandler, enabled: boolean = true) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (!matchesSpec(e, spec)) return
      if ((spec.ignoreInputs ?? true) && isTypingTarget(e.target)) {
        // Allow Cmd/Ctrl shortcuts even in input fields
        const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
        const metaOrCtrl = isMac ? e.metaKey : e.ctrlKey
        if (!spec.meta && !spec.ctrl && !metaOrCtrl) return
      }
      if (spec.preventDefault ?? true) e.preventDefault()
      handlerRef.current(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, spec.key, spec.meta, spec.ctrl, spec.shift, spec.alt, spec.preventDefault, spec.ignoreInputs])
}

export const SHORTCUTS_REGISTRY: Array<ShortcutSpec & { description: string }> = [
  { key: '?', shift: true, description: 'Show shortcuts help' },
  { key: 'Escape', description: 'Close modal / panel' },
  { key: ' ', description: 'Pause / resume lesson (board only)' },
  { key: 'Enter', meta: true, description: 'Send message' },
]
