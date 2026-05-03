'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { initTelemetry, track } from '../lib/telemetry'

/**
 * Bootstraps the telemetry library on first mount and emits a `page_view`
 * for every Next.js client-side navigation. Renders nothing.
 */
export default function TelemetryBoot() {
  const pathname = usePathname()

  useEffect(() => {
    initTelemetry()
  }, [])

  useEffect(() => {
    if (!pathname) return
    track('page_view', undefined, { page: pathname })
  }, [pathname])

  return null
}
