'use client'

import type React from 'react'
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

export const ELEMENT_RENDERERS: Record<ElementType, React.FC<ElementProps>> = {
  title: Title,
  text_block: TextBlock,
  equation: Equation,
  graph: Graph,
  shape: Shape,
  transform: TransformElement,
  code_block: CodeBlock,
  image: ImageElement,
  definition_box: DefinitionBox,
  theorem_box: TheoremBox,
  step_list: StepList,
  arrow: Arrow,
  highlight: HighlightElement,
  table: Table,
}

export function getRenderer(type: string): React.FC<ElementProps> {
  return (ELEMENT_RENDERERS as Record<string, React.FC<ElementProps>>)[type] || TextBlock
}
