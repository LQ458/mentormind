'use client'

import React from 'react'
import type { ElementProps } from './types'

export default function DefinitionBox({ element }: ElementProps) {
  return (
    <div className="relative rounded-lg border-2 border-sky-400/70 bg-sky-900/20 p-4 pt-6 max-w-md">
      <span className="absolute -top-3 left-3 bg-sky-500 text-white text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded">
        Definition
      </span>
      <div className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap">
        {element.content}
      </div>
    </div>
  )
}
