'use client'

import type { BoardElement, ElementType } from '../../../hooks/useBoardWebSocket'

export type { BoardElement, ElementType }

export interface ElementProps {
  element: BoardElement
  isHighlighted: boolean
  isExiting: boolean
}

export const COLOR_CLASS: Record<string, string> = {
  accent: 'text-sky-400',
  heading: 'text-white',
  text: 'text-slate-200',
  green: 'text-emerald-400',
  mauve: 'text-fuchsia-400',
  yellow: 'text-amber-300',
  red: 'text-rose-400',
}

export const SIZE_CLASS: Record<string, string> = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-2xl',
  xlarge: 'text-4xl',
}

export function colorClass(color?: string): string {
  return COLOR_CLASS[color || ''] || 'text-slate-100'
}

export function sizeClass(size?: string): string {
  return SIZE_CLASS[size || ''] || 'text-base'
}
