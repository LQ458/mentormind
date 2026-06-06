'use client'

import React, { useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ErrorBoundary from '../ErrorBoundary'
import ShortcutsHelp from '../ShortcutsHelp'
import CommandPalette from '../CommandPalette'
import SurveyTrigger from '../SurveyTrigger'
import ExitSurvey, { SURVEY_KEY } from '../ExitSurvey'
import PWAClient from '../PWAClient'
import FeedbackHub from '../FeedbackHub'
import ReportIssueButton from '../ReportIssueButton'
import { OPEN_FEEDBACK_EVENT, OPEN_SURVEY_EVENT, type FeedbackLaunchContext } from '../feedbackEvents'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/'
  const [mobileOpen, setMobileOpen] = useState(false)
  const [surveyOpen, setSurveyOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackContext, setFeedbackContext] = useState<FeedbackLaunchContext | null>(null)
  const openMenu = useCallback(() => setMobileOpen(true), [])
  const closeMenu = useCallback(() => setMobileOpen(false), [])
  const isPublicHome = pathname === '/'

  React.useEffect(() => {
    if (isPublicHome) return
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileOpen, closeMenu, isPublicHome])

  // Listen for the global open-survey event (fired by Topbar feedback button)
  React.useEffect(() => {
    if (isPublicHome) return
    const handler = () => {
      if (localStorage.getItem(SURVEY_KEY) !== '1') {
        setSurveyOpen(true)
      } else {
        // re-open even if already dismissed when triggered manually
        setSurveyOpen(true)
      }
    }
    window.addEventListener(OPEN_SURVEY_EVENT, handler)
    return () => window.removeEventListener(OPEN_SURVEY_EVENT, handler)
  }, [isPublicHome])

  // Listen for the global feedback event (fired by Topbar feedback button).
  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as FeedbackLaunchContext : null
      setFeedbackContext(detail || null)
      setFeedbackOpen(true)
    }
    window.addEventListener(OPEN_FEEDBACK_EVENT, handler)
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, handler)
  }, [isPublicHome])

  if (isPublicHome) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <ErrorBoundary>{children}</ErrorBoundary>
        <FeedbackHub
          open={feedbackOpen}
          launchContext={feedbackContext}
          onClose={() => {
            setFeedbackOpen(false)
            setFeedbackContext(null)
          }}
        />
        <ReportIssueButton
          surface="public_home"
          snapshot={{ area: 'public_home', page: pathname }}
          fixed
        />
        <PWAClient />
      </div>
    )
  }

  return (
    <div className="app">
      {/* Mobile overlay — closes drawer on click-outside */}
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={closeMenu} aria-hidden="true" />
      )}
      <Sidebar mobileOpen={mobileOpen} onClose={closeMenu} />
      <Topbar onMenuClick={openMenu} menuOpen={mobileOpen} />
      <div className="main">
        <div className="main-inner">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </div>
      <ShortcutsHelp />
      <CommandPalette />
      {/* Auto-trigger survey after 5 min + 1 board lesson */}
      <SurveyTrigger onTrigger={() => setSurveyOpen(true)} />
      {/* Controlled survey modal */}
      <ExitSurvey open={surveyOpen} onClose={() => setSurveyOpen(false)} />
      <FeedbackHub
        open={feedbackOpen}
        launchContext={feedbackContext}
        onClose={() => {
          setFeedbackOpen(false)
          setFeedbackContext(null)
        }}
      />
      <ReportIssueButton
        surface="global"
        snapshot={{ area: 'app_shell', page: pathname }}
        fixed
      />
      <PWAClient />
    </div>
  )
}
