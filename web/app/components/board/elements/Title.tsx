'use client'

import React from 'react'
import type { ElementProps } from './types'
import { colorClass, sizeClass } from './types'

export default function Title({ element }: ElementProps) {
  const cc = colorClass(element.style.color || 'heading')
  const sc = sizeClass(element.style.size || 'xlarge')
  return (
    <h1 className={`font-bold tracking-tight ${cc} ${sc}`}>
      {element.content}
    </h1>
  )
}
