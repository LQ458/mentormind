'use client'

import React from 'react'
import type { ElementProps } from './types'
import { ProseRenderer } from './proseRenderer'

// Heuristic: if the highlight is a short label (≤ 60 chars, no code), keep the
// compact pulsing pill. If it's longer prose with embedded code (e.g.
// "AP Exam Trap: ... int x; System.out.println(x); // ERROR"), render with
// proper line breaks and code formatting.
export default function HighlightElement({ element }: ElementProps) {
  const content = element.content || 'Highlight'
  const isShortLabel = content.length <= 60 && !/[;{}]|\bSystem\.|\bint\s+\w/.test(content)

  if (isShortLabel) {
    return (
      <div className="relative inline-block rounded-md ring-2 ring-amber-300/80 bg-amber-300/10 px-3 py-1.5 animate-pulse">
        <span className="text-amber-200 text-sm font-medium">{content}</span>
      </div>
    )
  }

  return (
    <div className="relative rounded-lg border-2 border-amber-400/70 bg-amber-900/15 p-4 max-w-2xl">
      <div className="text-amber-100">
        <ProseRenderer content={content} variant="highlight" />
      </div>
    </div>
  )
}
