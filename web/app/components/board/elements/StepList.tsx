'use client'

import React from 'react'
import type { ElementProps } from './types'

export default function StepList({ element }: ElementProps) {
  const steps = (element.metadata?.steps as string[] | undefined) || []
  const items = steps.length > 0 ? steps : element.content.split('\n').filter(Boolean)
  return (
    <ol className="list-decimal list-inside space-y-1.5 text-slate-100 text-sm">
      {items.map((step, i) => (
        <li key={i} className="leading-relaxed">
          {step}
        </li>
      ))}
    </ol>
  )
}
