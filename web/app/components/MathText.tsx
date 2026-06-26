'use client'

import katex from 'katex'
import 'katex/dist/katex.min.css'
import DOMPurify from 'dompurify'
import type React from 'react'

const KATEX_ALLOWED_TAGS = [
  'span', 'math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub',
  'mfrac', 'msqrt', 'mtext', 'annotation', 'semantics',
]
const KATEX_ALLOWED_ATTR = ['class', 'style', 'aria-hidden']

function sanitizeLatex(html: string): string {
  if (typeof window === 'undefined') return html
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: KATEX_ALLOWED_TAGS,
    ALLOWED_ATTR: KATEX_ALLOWED_ATTR,
  })
}

function renderLatex(latex: string, displayMode = false): string {
  try {
    return katex.renderToString(latex.trim(), {
      throwOnError: false,
      displayMode,
      strict: false,
    })
  } catch {
    return latex
  }
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const pattern = /(\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\*\*(.+?)\*\*|`([^`]+?)`)/g
  let last = 0
  let match: RegExpExecArray | null
  let index = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<span key={`${keyPrefix}-t-${index++}`}>{text.slice(last, match.index)}</span>)
    }

    const displayMath = match[2] ?? match[4]
    const inlineMath = match[3] ?? match[5]
    const bold = match[6]
    const code = match[7]

    if (displayMath !== undefined) {
      parts.push(
        <span
          key={`${keyPrefix}-dm-${index++}`}
          className="my-3 block overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: sanitizeLatex(renderLatex(displayMath, true)) }}
        />,
      )
    } else if (inlineMath !== undefined) {
      parts.push(
        <span
          key={`${keyPrefix}-im-${index++}`}
          className="inline-block max-w-full overflow-x-auto align-middle"
          dangerouslySetInnerHTML={{ __html: sanitizeLatex(renderLatex(inlineMath, false)) }}
        />,
      )
    } else if (bold !== undefined) {
      parts.push(<strong key={`${keyPrefix}-b-${index++}`} className="font-semibold text-gray-900">{bold}</strong>)
    } else if (code !== undefined) {
      parts.push(
        <code key={`${keyPrefix}-c-${index++}`} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800">
          {code}
        </code>,
      )
    }

    last = match.index + match[0].length
  }

  if (last < text.length) parts.push(<span key={`${keyPrefix}-t-${index++}`}>{text.slice(last)}</span>)
  return parts
}

export function MathText({ content, className = '' }: { content: string; className?: string }) {
  const lines = String(content ?? '').split('\n')
  return (
    <div className={`space-y-2 text-sm leading-7 text-gray-900 ${className}`}>
      {lines.map((line, index) => (
        line.trim()
          ? <p key={index} className="min-w-0 break-words">{renderInline(line, String(index))}</p>
          : <div key={index} className="h-2" />
      ))}
    </div>
  )
}
