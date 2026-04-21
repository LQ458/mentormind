'use client'

import React from 'react'
import type { ElementProps } from './types'

export default function ImageElement({ element }: ElementProps) {
  const src = element.content
  if (!src) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={(element.metadata?.alt as string | undefined) || ''}
      className="max-w-full max-h-72 rounded-lg border border-slate-700"
    />
  )
}
