'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { toast } from 'sonner'

interface UseCopyToClipboardOptions {
  successMessage?: string
  errorMessage?: string
  resetMs?: number
  silent?: boolean
}

export function useCopyToClipboard(options: UseCopyToClipboardOptions = {}) {
  const {
    successMessage = '已复制 / Copied',
    errorMessage = '复制失败 / Copy failed',
    resetMs = 1500,
    silent = false,
  } = options
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const copy = useCallback(
    async (value: string): Promise<boolean> => {
      try {
        if (typeof navigator === 'undefined' || !navigator.clipboard) {
          throw new Error('Clipboard API not available')
        }
        await navigator.clipboard.writeText(value)
        setCopied(true)
        if (!silent) toast.success(successMessage, { duration: 1200 })
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), resetMs)
        return true
      } catch (err) {
        console.error('[useCopyToClipboard]', err)
        if (!silent) toast.error(errorMessage)
        return false
      }
    },
    [successMessage, errorMessage, resetMs, silent]
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { copy, copied }
}
