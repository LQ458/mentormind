'use client'

import React from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <Topbar />
      <div className="main">
        <div className="main-inner">{children}</div>
      </div>
    </div>
  )
}
