'use client'

import React from 'react'
import { BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import type { ElementProps } from './types'
import { colorClass } from './types'

export default function Equation({ element }: ElementProps) {
  const cc = colorClass(element.style.color || 'heading')
  return (
    <div className={`board-equation ${cc}`}>
      <BlockMath math={element.content || ''} />
    </div>
  )
}
