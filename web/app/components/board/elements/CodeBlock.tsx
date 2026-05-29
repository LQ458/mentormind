'use client'

import React from 'react'
import type { ElementProps } from './types'
import { useCopyToClipboard } from '../../../hooks/useCopyToClipboard'

export default function CodeBlock({ element }: ElementProps) {
  const lang = (element.metadata?.code_language as string | undefined) || 'plaintext'
  const { copy, copied } = useCopyToClipboard()
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={() => copy(String(element.content || ''))}
        className="absolute top-2 right-2 px-2 py-1 text-[10px] uppercase tracking-wider rounded border border-slate-600 bg-slate-800/80 text-slate-200 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-slate-700"
        aria-label="Copy code to clipboard"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      <pre className="rounded-lg bg-slate-950 border border-slate-700 p-3 overflow-x-auto text-xs text-slate-100">
        <code className={`language-${lang} font-mono leading-relaxed`}>
          {element.content}
        </code>
      </pre>
    </div>
  )
}
