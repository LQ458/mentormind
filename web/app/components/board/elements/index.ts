'use client'

import React from 'react'
import type { ElementProps, ElementType } from './types'
import Title from './Title'
import TextBlock from './TextBlock'
import Equation from './Equation'
import Graph from './Graph'
import Shape from './Shape'
import Table from './Table'
import DefinitionBox from './DefinitionBox'
import TheoremBox from './TheoremBox'
import StepList from './StepList'
import CodeBlock from './CodeBlock'
import TransformElement from './TransformElement'
import Arrow from './Arrow'
import HighlightElement from './HighlightElement'
import ImageElement from './ImageElement'

export type { ElementProps, ElementType }
export type { BoardElement } from './types'

/**
 * Equality check for ``ElementProps``: only re-render a renderer when the
 * specific element it was given changes (or its highlight/exit state flips).
 * Other elements in the canvas can update without thrashing this one.
 */
function elementPropsEqual(prev: ElementProps, next: ElementProps): boolean {
  if (prev.isHighlighted !== next.isHighlighted) return false
  if (prev.isExiting !== next.isExiting) return false
  const a = prev.element
  const b = next.element
  if (a === b) return true
  if (a.element_id !== b.element_id) return false
  if (a.content !== b.content) return false
  if (a.state !== b.state) return false
  if (a.element_type !== b.element_type) return false
  if (a.narration !== b.narration) return false
  // Position/style/metadata are small structured objects; stringify is fine
  // and short-circuits cheaply when the references are identical.
  if (a.position !== b.position && JSON.stringify(a.position) !== JSON.stringify(b.position)) return false
  if (a.style !== b.style && JSON.stringify(a.style) !== JSON.stringify(b.style)) return false
  if (a.metadata !== b.metadata && JSON.stringify(a.metadata) !== JSON.stringify(b.metadata)) return false
  return true
}

function memoize<P extends ElementProps>(Component: React.FC<P>, displayName: string): React.FC<P> {
  const Memoized = React.memo(Component, elementPropsEqual as (a: P, b: P) => boolean)
  Memoized.displayName = `Memo(${displayName})`
  return Memoized as unknown as React.FC<P>
}

export const ELEMENT_RENDERERS: Record<ElementType, React.FC<ElementProps>> = {
  title: memoize(Title, 'Title'),
  text_block: memoize(TextBlock, 'TextBlock'),
  equation: memoize(Equation, 'Equation'),
  graph: memoize(Graph, 'Graph'),
  shape: memoize(Shape, 'Shape'),
  transform: memoize(TransformElement, 'TransformElement'),
  code_block: memoize(CodeBlock, 'CodeBlock'),
  image: memoize(ImageElement, 'ImageElement'),
  definition_box: memoize(DefinitionBox, 'DefinitionBox'),
  theorem_box: memoize(TheoremBox, 'TheoremBox'),
  step_list: memoize(StepList, 'StepList'),
  arrow: memoize(Arrow, 'Arrow'),
  highlight: memoize(HighlightElement, 'HighlightElement'),
  table: memoize(Table, 'Table'),
}

const FALLBACK_RENDERER = memoize(TextBlock, 'TextBlockFallback')

export function getRenderer(type: string): React.FC<ElementProps> {
  return (ELEMENT_RENDERERS as Record<string, React.FC<ElementProps>>)[type] || FALLBACK_RENDERER
}
