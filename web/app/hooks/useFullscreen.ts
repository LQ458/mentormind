'use client'

import { useCallback, useEffect, useState, RefObject } from 'react'

interface FullscreenAPI {
  requestFullscreen?: () => Promise<void>
  webkitRequestFullscreen?: () => Promise<void>
  msRequestFullscreen?: () => Promise<void>
}

export function useFullscreen<T extends HTMLElement>(ref: RefObject<T>) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const enter = useCallback(async () => {
    const el = ref.current as (T & FullscreenAPI) | null
    if (!el) return
    try {
      if (el.requestFullscreen) await el.requestFullscreen()
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen()
      else if (el.msRequestFullscreen) await el.msRequestFullscreen()
    } catch (err) {
      console.warn('[useFullscreen] enter failed', err)
    }
  }, [ref])

  const exit = useCallback(async () => {
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void>
      msExitFullscreen?: () => Promise<void>
    }
    try {
      if (document.exitFullscreen) await document.exitFullscreen()
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen()
      else if (doc.msExitFullscreen) await doc.msExitFullscreen()
    } catch (err) {
      console.warn('[useFullscreen] exit failed', err)
    }
  }, [])

  const toggle = useCallback(() => {
    if (isFullscreen) void exit()
    else void enter()
  }, [isFullscreen, enter, exit])

  useEffect(() => {
    const onChange = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null
        msFullscreenElement?: Element | null
      }
      const fsEl = document.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement
      setIsFullscreen(Boolean(fsEl) && fsEl === ref.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [ref])

  return { isFullscreen, enter, exit, toggle }
}
