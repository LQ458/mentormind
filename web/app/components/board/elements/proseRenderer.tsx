'use client'

import React from 'react'

// Heuristic: does this token look like a code expression?
// - ends with `;` (Java/C-style statement)
// - contains `()` or `{}` and an identifier
// - matches typed-declaration shape: <keyword> <ident> [= ...]?  (int x = 0)
// - starts with `//` or `/*` (a comment)
const TYPE_KEYWORDS = '(?:int|long|short|byte|float|double|boolean|char|String|void|var|let|const|public|private|static|final|class|struct|enum|def|fn|func|return|if|else|for|while|switch|case|break|continue|new|null|true|false)'
const CODE_LOOKS_LIKE = new RegExp(
  [
    `^${TYPE_KEYWORDS}\\b[^.]*[;{]?\\s*$`,           // typed decl
    `^[A-Za-z_][\\w$.]*\\s*\\([^.]*\\)\\s*[;{]?\\s*$`, // function call
    `^[A-Za-z_][\\w$.]*\\s*=\\s*[^.]+;\\s*$`,         // assignment ends ;
    `^//.*$`,                                         // line comment
    `^/\\*[\\s\\S]*\\*/$`,                            // block comment
  ].join('|')
)

// Standalone "code-looking" inline pattern: identifier followed by ; or () with typed
// keyword nearby. Catches "int x;" or "System.out.println(x);" inside prose.
const INLINE_CODE_PATTERNS: Array<RegExp> = [
  /\b(?:int|long|short|byte|float|double|boolean|char|String|void|var|let|const)\s+[A-Za-z_][\w$]*(?:\s*=\s*[^.;]*)?;/g,
  /\b[A-Za-z_][\w$]*\.[A-Za-z_][\w$.]*\s*\([^)]*\)\s*;?/g,           // System.out.println(x)
  /\/\/[^\n]+(?=\s*$)/g,                                              // trailing line comment
]

function looksLikeCodeLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  return CODE_LOOKS_LIKE.test(t)
}

interface ProseSegment {
  kind: 'text' | 'code' | 'heading' | 'spacer'
  value: string
}

// Split a chunk of text into prose / code / heading segments.
// Recognized patterns:
//   "Term: rest"       -> heading: Term, then text: rest
//   "Example: code"    -> heading: Example:, then code on next line
//   line ending in ;   -> code line
export function parseProse(raw: string): ProseSegment[] {
  const out: ProseSegment[] = []
  // Normalize literal escape sequences from JSON.
  const normalized = raw.replace(/\\r\\n|\\n/g, '\n').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  for (let line of lines) {
    if (line.trim() === '') {
      out.push({ kind: 'spacer', value: '' })
      continue
    }

    // Pull out an "Example: ..." marker — push a heading and treat the rest as a code-or-text segment.
    const exMatch = line.match(/^(\s*)(Example|示例|举例|For example|e\.g\.)\s*[:：]\s*(.*)$/i)
    if (exMatch) {
      out.push({ kind: 'heading', value: exMatch[2] + ':' })
      const rest = exMatch[3].trim()
      if (rest) {
        if (looksLikeCodeLine(rest)) out.push({ kind: 'code', value: rest })
        else splitInlineCode(rest, out)
      }
      continue
    }

    // "Combined: int score = 0;" style — bold the prefix, code-format the rest.
    const labelCode = line.match(/^(\s*)([A-Z][A-Za-z 0-9]{2,30})\s*[:：]\s*(.+)$/)
    if (labelCode && looksLikeCodeLine(labelCode[3].trim())) {
      out.push({ kind: 'heading', value: labelCode[2] + ':' })
      out.push({ kind: 'code', value: labelCode[3].trim() })
      continue
    }

    if (looksLikeCodeLine(line)) {
      out.push({ kind: 'code', value: line.trim() })
      continue
    }

    splitInlineCode(line, out)
  }
  return out
}

// Split a prose line that mixes inline code into prose + code chunks.
function splitInlineCode(line: string, out: ProseSegment[]) {
  // Collect all matches across the inline-code regexes.
  const ranges: Array<{ start: number; end: number; text: string }> = []
  for (const re of INLINE_CODE_PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length, text: m[0] })
    }
  }
  if (ranges.length === 0) {
    out.push({ kind: 'text', value: line })
    return
  }
  // Merge overlapping ranges, then split.
  ranges.sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number; text: string }> = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end)
      last.text = line.slice(last.start, last.end)
    } else {
      merged.push({ ...r })
    }
  }
  // If a code chunk takes up nearly the whole line, just emit it as a code segment.
  if (merged.length === 1 && merged[0].end - merged[0].start >= line.trim().length - 2) {
    const prefix = line.slice(0, merged[0].start).trim()
    const suffix = line.slice(merged[0].end).trim()
    if (prefix) out.push({ kind: 'text', value: prefix })
    out.push({ kind: 'code', value: merged[0].text })
    if (suffix) out.push({ kind: 'text', value: suffix })
    return
  }
  // Mixed inline — break each code piece onto its own line for readability.
  let cursor = 0
  for (const r of merged) {
    if (r.start > cursor) {
      const before = line.slice(cursor, r.start).replace(/\s+$/, '')
      if (before.trim()) out.push({ kind: 'text', value: before })
    }
    out.push({ kind: 'code', value: r.text })
    cursor = r.end
  }
  if (cursor < line.length) {
    const tail = line.slice(cursor).replace(/^\s+/, '')
    if (tail.trim()) out.push({ kind: 'text', value: tail })
  }
}

// Inline markdown: **bold**, *italic*, `code`.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|(?:^|(?<=\s|[^\w]))\*[^*\s][^*]*?[^*\s]?\*(?=\s|$|[^\w]))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const raw = m[0]
    if (raw.startsWith('**')) out.push(<strong key={`${keyPrefix}-b${i++}`}>{raw.slice(2, -2)}</strong>)
    else if (raw.startsWith('`')) out.push(
      <code key={`${keyPrefix}-c${i++}`} className="font-mono bg-slate-800/60 border border-slate-600/40 rounded px-1.5 py-0.5 text-[0.92em]">
        {raw.slice(1, -1)}
      </code>
    )
    else out.push(<em key={`${keyPrefix}-i${i++}`}>{raw.slice(1, -1)}</em>)
    last = m.index + raw.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

interface ProseRendererProps {
  content: string
  variant?: 'definition' | 'theorem' | 'highlight' | 'plain'
}

export function ProseRenderer({ content, variant = 'plain' }: ProseRendererProps) {
  const segments = parseProse(content)
  const codeBg =
    variant === 'definition' ? 'bg-sky-950/60 border-sky-400/30 text-sky-100' :
    variant === 'theorem' ? 'bg-amber-950/40 border-amber-400/30 text-amber-50' :
    variant === 'highlight' ? 'bg-amber-950/60 border-amber-300/40 text-amber-100' :
    'bg-slate-900/70 border-slate-600/40 text-slate-100'
  const headingColor =
    variant === 'definition' ? 'text-sky-200' :
    variant === 'theorem' ? 'text-amber-200' :
    variant === 'highlight' ? 'text-amber-100' :
    'text-slate-100'

  return (
    <div className="space-y-2">
      {segments.map((seg, idx) => {
        if (seg.kind === 'spacer') {
          return <div key={idx} className="h-1" />
        }
        if (seg.kind === 'heading') {
          return (
            <div key={idx} className={`text-xs font-semibold uppercase tracking-wide ${headingColor} mt-2 first:mt-0`}>
              {seg.value}
            </div>
          )
        }
        if (seg.kind === 'code') {
          return (
            <pre
              key={idx}
              className={`font-mono text-[0.85em] leading-relaxed ${codeBg} border rounded-md px-3 py-2 overflow-x-auto`}
            >
              <code>{seg.value}</code>
            </pre>
          )
        }
        return (
          <p key={idx} className="text-sm leading-relaxed">
            {renderInline(seg.value, `s${idx}`)}
          </p>
        )
      })}
    </div>
  )
}
