'use client'

import React from 'react'
import type { ElementProps } from './types'

// TODO: Wire arrow_from / arrow_to to real element positions once layout
// reports element-to-pixel mapping. For now, render a standalone arrow at the
// element's own position.
export default function Arrow({ element }: ElementProps) {
  return (
    <svg viewBox="0 0 160 40" className="w-32 h-10">
      <defs>
        <marker
          id={`arrowhead-${element.element_id}`}
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="5"
          orient="auto"
        >
          <polygon points="0 0, 10 5, 0 10" fill="#38bdf8" />
        </marker>
      </defs>
      <line
        x1="10"
        y1="20"
        x2="140"
        y2="20"
        stroke="#38bdf8"
        strokeWidth="2.5"
        markerEnd={`url(#arrowhead-${element.element_id})`}
      />
      {element.content && (
        <text x="80" y="14" textAnchor="middle" fontSize="10" fill="#cbd5e1">
          {element.content}
        </text>
      )}
    </svg>
  )
}
