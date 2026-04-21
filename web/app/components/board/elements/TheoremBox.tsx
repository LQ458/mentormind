'use client'

import React from 'react'
import type { ElementProps } from './types'

export default function TheoremBox({ element }: ElementProps) {
  return (
    <div className="relative rounded-lg border-[3px] border-amber-400 bg-amber-900/20 p-4 pt-6 max-w-md">
      <span className="absolute -top-3 left-3 bg-amber-500 text-slate-900 text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded">
        Theorem
      </span>
      <div className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap font-medium">
        {element.content}
      </div>
    </div>
  )
}
