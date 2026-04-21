'use client'

import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface SummaryPanelProps {
  open: boolean
  onClose: () => void
  summary: string | null
  onRequestSummary: () => Promise<void>
  isLoading: boolean
  canRequest: boolean
}

// Very small markdown: headings, bold/italic, bullets.
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n')
  const out: React.ReactNode[] = []
  let listBuffer: string[] = []
  const flushList = (key: string) => {
    if (listBuffer.length === 0) return
    out.push(
      <ul key={key} className="list-disc list-inside space-y-1 my-2 text-slate-200 text-sm">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    )
    listBuffer = []
  }
  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd()
    if (/^\s*[-*]\s+/.test(line)) {
      listBuffer.push(line.replace(/^\s*[-*]\s+/, ''))
      return
    }
    flushList(`list-${idx}`)
    if (/^###\s+/.test(line)) {
      out.push(<h4 key={idx} className="font-semibold text-slate-100 mt-3 mb-1">{renderInline(line.replace(/^###\s+/, ''))}</h4>)
    } else if (/^##\s+/.test(line)) {
      out.push(<h3 key={idx} className="font-semibold text-slate-100 text-lg mt-3 mb-1">{renderInline(line.replace(/^##\s+/, ''))}</h3>)
    } else if (/^#\s+/.test(line)) {
      out.push(<h2 key={idx} className="font-bold text-slate-50 text-xl mt-4 mb-2">{renderInline(line.replace(/^#\s+/, ''))}</h2>)
    } else if (line.trim() === '') {
      out.push(<div key={idx} className="h-2" />)
    } else {
      out.push(<p key={idx} className="text-sm text-slate-200 leading-relaxed my-1">{renderInline(line)}</p>)
    }
  })
  flushList('list-end')
  return out
}

function renderInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) tokens.push(text.slice(last, match.index))
    const raw = match[0]
    if (raw.startsWith('**')) tokens.push(<strong key={`b${i++}`}>{raw.slice(2, -2)}</strong>)
    else tokens.push(<em key={`i${i++}`}>{raw.slice(1, -1)}</em>)
    last = match.index + raw.length
  }
  if (last < text.length) tokens.push(text.slice(last))
  return tokens
}

export default function SummaryPanel({
  open,
  onClose,
  summary,
  onRequestSummary,
  isLoading,
  canRequest,
}: SummaryPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.25 }}
          className="fixed top-0 right-0 h-full w-full max-w-md bg-slate-900/95 backdrop-blur border-l border-slate-700 z-40 flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h3 className="text-sm font-semibold text-slate-100">Lesson Summary</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 text-sm"
              aria-label="Close summary"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {summary ? (
              <div>{renderMarkdown(summary)}</div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <p className="text-sm text-slate-400">
                  No summary yet.
                </p>
                <button
                  type="button"
                  onClick={() => { void onRequestSummary() }}
                  disabled={!canRequest || isLoading}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-sm font-medium"
                >
                  {isLoading ? 'Generating…' : 'Generate summary'}
                </button>
                {!canRequest && !isLoading && (
                  <p className="text-xs text-slate-500">Available once the lesson is done.</p>
                )}
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
