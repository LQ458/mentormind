'use client'

import React from 'react'
import type { ElementProps } from './types'
import { colorClass, sizeClass } from './types'

function renderInline(text: string): React.ReactNode[] {
  // Very small markdown: **bold** and *italic*.
  // Italic pattern requires non-word chars (or string edge) around the *...* pair
  // so math like `3*2` is not mis-rendered as italic.
  const tokens: React.ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|(?:^|(?<=\s|[^\w]))\*[^*\s][^*]*?[^*\s]?\*(?=\s|$|[^\w]))/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) tokens.push(text.slice(last, match.index))
    const raw = match[0]
    if (raw.startsWith('**')) {
      tokens.push(<strong key={`b${i++}`}>{raw.slice(2, -2)}</strong>)
    } else {
      tokens.push(<em key={`i${i++}`}>{raw.slice(1, -1)}</em>)
    }
    last = match.index + raw.length
  }
  if (last < text.length) tokens.push(text.slice(last))
  return tokens
}

// Some LLM responses arrive with literal `\n` escape sequences (2 chars:
// backslash + n) instead of real newlines. Normalize both, plus `\r\n`, so
// split('\n') reliably produces one paragraph per intended line.
function normalizeNewlines(s: string): string {
  return s.replace(/\\r\\n|\\n/g, '\n').replace(/\r\n/g, '\n')
}

export default function TextBlock({ element }: ElementProps) {
  const cc = colorClass(element.style.color || 'text')
  const sc = sizeClass(element.style.size || 'medium')
  const lines = normalizeNewlines(element.content).split('\n')
  return (
    <div className={`leading-relaxed ${cc} ${sc}`}>
      {lines.map((line, idx) => (
        <p key={idx} className={line.trim() === '' ? 'h-3' : 'mb-2 last:mb-0'}>
          {renderInline(line)}
        </p>
      ))}
    </div>
  )
}
