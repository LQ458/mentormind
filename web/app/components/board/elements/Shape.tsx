'use client'

import React from 'react'
import type { ElementProps } from './types'

export default function Shape({ element }: ElementProps) {
  const shape = (element.metadata?.shape_type as string | undefined) || 'rectangle'
  const color = '#38bdf8'

  return (
    <svg viewBox="0 0 120 120" className="w-32 h-32">
      {shape === 'circle' && (
        <circle cx="60" cy="60" r="45" fill="none" stroke={color} strokeWidth="3" />
      )}
      {shape === 'triangle' && (
        <polygon points="60,15 105,100 15,100" fill="none" stroke={color} strokeWidth="3" />
      )}
      {shape === 'rectangle' && (
        <rect x="15" y="25" width="90" height="70" fill="none" stroke={color} strokeWidth="3" />
      )}
      {shape === 'line' && (
        <line x1="15" y1="60" x2="105" y2="60" stroke={color} strokeWidth="3" />
      )}
      {shape === 'arrow' && (
        <g stroke={color} strokeWidth="3" fill={color}>
          <line x1="15" y1="60" x2="95" y2="60" />
          <polygon points="95,50 110,60 95,70" />
        </g>
      )}
      {shape === 'polygon' && (
        <polygon points="60,10 105,40 90,95 30,95 15,40" fill="none" stroke={color} strokeWidth="3" />
      )}
      {element.content && (
        <text x="60" y="115" textAnchor="middle" fontSize="10" fill="#cbd5e1">
          {element.content}
        </text>
      )}
    </svg>
  )
}
