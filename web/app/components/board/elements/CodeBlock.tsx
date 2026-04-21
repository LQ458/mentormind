'use client'

import React from 'react'
import type { ElementProps } from './types'

export default function CodeBlock({ element }: ElementProps) {
  const lang = (element.metadata?.code_language as string | undefined) || 'plaintext'
  return (
    <pre className="rounded-lg bg-slate-950 border border-slate-700 p-3 overflow-x-auto text-xs text-slate-100">
      <code className={`language-${lang} font-mono leading-relaxed`}>
        {element.content}
      </code>
    </pre>
  )
}
