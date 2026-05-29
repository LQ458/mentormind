'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { SURVEY_KEY } from './ExitSurvey'

const SESSION_START_KEY = 'mm-session-start'
const BOARD_OPENS_KEY = 'mm-board-opens'
const MIN_DURATION_MS = 5 * 60 * 1000 // 5 minutes
const MIN_BOARD_OPENS = 1

interface SurveyTriggerProps {
  onTrigger: () => void
}

export default function SurveyTrigger({ onTrigger }: SurveyTriggerProps) {
  const pathname = usePathname() || ''

  // Record session start on first mount
  useEffect(() => {
    if (!sessionStorage.getItem(SESSION_START_KEY)) {
      sessionStorage.setItem(SESSION_START_KEY, String(Date.now()))
    }
  }, [])

  // Track board page opens
  useEffect(() => {
    if (!pathname.startsWith('/board/')) return
    const prev = parseInt(sessionStorage.getItem(BOARD_OPENS_KEY) || '0', 10)
    sessionStorage.setItem(BOARD_OPENS_KEY, String(prev + 1))
  }, [pathname])

  // Periodically check whether to show the survey
  useEffect(() => {
    const check = () => {
      if (localStorage.getItem(SURVEY_KEY) === '1') return
      const start = parseInt(sessionStorage.getItem(SESSION_START_KEY) || '0', 10)
      const opens = parseInt(sessionStorage.getItem(BOARD_OPENS_KEY) || '0', 10)
      const elapsed = Date.now() - start
      if (elapsed >= MIN_DURATION_MS && opens >= MIN_BOARD_OPENS) {
        onTrigger()
      }
    }
    // check every 30 seconds
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [onTrigger])

  return null
}
