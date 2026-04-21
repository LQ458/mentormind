'use client'

import React from 'react'
import type { ElementProps } from './types'

export default function HighlightElement({ element }: ElementProps) {
  return (
    <div className="relative inline-block rounded-md ring-2 ring-amber-300/80 bg-amber-300/10 px-3 py-1.5 animate-pulse">
      <span className="text-amber-200 text-sm font-medium">
        {element.content || 'Highlight'}
      </span>
    </div>
  )
}
