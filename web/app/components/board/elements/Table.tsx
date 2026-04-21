'use client'

import React from 'react'
import type { ElementProps } from './types'

export default function Table({ element }: ElementProps) {
  const headers = (element.metadata?.table_headers as string[] | undefined) || []
  const rows = (element.metadata?.table_rows as string[][] | undefined) || []
  if (headers.length === 0 && rows.length === 0) {
    const fallback = (element.content || element.narration || '').trim()
    return (
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-4 py-3 text-sm text-slate-400 italic">
        {fallback || '(Table data unavailable)'}
      </div>
    )
  }
  return (
    <table className="border-collapse text-sm text-slate-200">
      {headers.length > 0 && (
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="border border-slate-600 bg-slate-800 px-3 py-1.5 font-semibold text-left"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} className="border border-slate-700 px-3 py-1.5">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
