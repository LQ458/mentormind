'use client'

import React from 'react'
import type { ElementProps } from './types'
import { colorClass, sizeClass } from './types'
import { ProseRenderer } from './proseRenderer'

export default function TextBlock({ element }: ElementProps) {
  const cc = colorClass(element.style.color || 'text')
  const sc = sizeClass(element.style.size || 'medium')
  return (
    <div className={`leading-relaxed ${cc} ${sc}`}>
      <ProseRenderer content={element.content} variant="plain" />
    </div>
  )
}
