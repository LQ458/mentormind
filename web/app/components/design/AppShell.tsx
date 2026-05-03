'use client'

import React from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import ErrorBoundary from '../ErrorBoundary'
import ShortcutsHelp from '../ShortcutsHelp'
import CommandPalette from '../CommandPalette'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <Topbar />
      <div className="main">
        <div className="main-inner">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </div>
      <ShortcutsHelp />
      <CommandPalette />
    </div>
  )
}
