'use client'

import React, { useState } from 'react'
import BoardCanvas from '../components/board/BoardCanvas'
import type { BoardElement, BoardWSState } from '../hooks/useBoardWebSocket'

function mkEl(
  id: string,
  type: BoardElement['element_type'],
  content: string,
  extra: Partial<BoardElement> = {},
): BoardElement {
  return {
    element_id: id,
    element_type: type,
    content,
    position: { region: 'center' },
    style: { animation: 'fade_in', size: 'medium', color: 'text' },
    state: 'normal',
    ...extra,
  }
}

const TEST_ELEMENTS: BoardElement[] = [
  mkEl('title-1', 'title', "Today's Lesson: Derivatives in Motion", {
    style: { size: 'xlarge', color: 'heading', animation: 'fade_in' },
  }),
  mkEl(
    'text-1',
    'text_block',
    "We'll cover five topics today. Take your time — the board is scrollable, so earlier items stay available.",
    { style: { size: 'medium', color: 'text', animation: 'fade_in' } },
  ),
  mkEl('step-1', 'step_list', 'Five topics to explore', {
    style: { size: 'medium', color: 'text', animation: 'slide_in' },
    metadata: {
      steps: [
        'Interpreting derivatives in context',
        'Straight-line motion fundamentals',
        'Velocity and acceleration',
        'Optimization problems',
        'Related rates',
      ],
    },
  }),
  mkEl('def-1', 'definition_box', 'The derivative measures instantaneous rate of change.', {
    style: { size: 'medium', color: 'accent', animation: 'grow' },
    metadata: { title: 'Definition: Derivative' },
  }),
  mkEl('thm-1', 'theorem_box', 'If f is differentiable at c, then f is continuous at c.', {
    style: { size: 'medium', color: 'green', animation: 'grow' },
    metadata: { title: 'Theorem: Differentiability implies continuity' },
  }),
  mkEl('eq-1', 'equation', "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}", {
    style: { size: 'large', color: 'heading', animation: 'write' },
  }),
  mkEl(
    'code-1',
    'code_block',
    `def derivative(f, x, h=1e-6):
    return (f(x + h) - f(x)) / h

print(derivative(lambda t: t**2, 3))  # ~6`,
    {
      style: { size: 'small', color: 'text', animation: 'fade_in' },
      metadata: { code_language: 'python' },
    },
  ),
  mkEl('graph-1', 'graph', 'Parabola y = x²', {
    style: { size: 'medium', color: 'accent', animation: 'fade_in' },
    metadata: {
      graph_expression: 'x**2',
      graph_x_range: [-3, 3],
      graph_y_range: [-1, 9],
    },
  }),
  mkEl('shape-1', 'shape', 'Unit circle', {
    style: { size: 'medium', color: 'mauve', animation: 'fade_in' },
    metadata: { shape_type: 'circle' },
  }),
  mkEl('arrow-1', 'arrow', 'Flow of derivation', {
    style: { size: 'medium', color: 'yellow', animation: 'slide_in' },
    metadata: { arrow_from: 'f(x)', arrow_to: "f'(x)" },
  }),
  mkEl('transform-1', 'transform', 'Transform demo', {
    style: { size: 'medium', color: 'accent', animation: 'grow' },
    metadata: { transform_from: 'x^2', transform_to: '2x' },
  }),
  mkEl('highlight-1', 'highlight', 'Key insight: slope IS the derivative.', {
    style: { size: 'medium', color: 'yellow', animation: 'fade_in' },
    metadata: { highlight_target: 'slope' },
  }),
  mkEl(
    'table-1',
    'table',
    'Derivatives of elementary functions',
    {
      style: { size: 'small', color: 'text', animation: 'fade_in' },
      metadata: {
        table_headers: ['f(x)', "f'(x)"],
        table_rows: [
          ['x^n', 'n·x^(n-1)'],
          ['sin(x)', 'cos(x)'],
          ['cos(x)', '-sin(x)'],
          ['e^x', 'e^x'],
          ['ln(x)', '1/x'],
        ],
      },
    },
  ),
  mkEl('image-1', 'image', 'https://placehold.co/640x360/0f172a/38bdf8?text=Tangent+Line', {
    style: { size: 'medium', color: 'text', animation: 'fade_in' },
    metadata: { alt: 'Tangent line illustration' } as any,
  }),
]

export default function BoardTestPage() {
  const [paused, setPaused] = useState(false)
  const [elements, setElements] = useState<BoardElement[]>(TEST_ELEMENTS.slice(0, 3))

  const state: BoardWSState = {
    board: {
      board_id: 'test',
      title: 'Board Layout Test Harness',
      layout: 'focus_center',
      background: 'dark_board',
      topic: 'All 14 element renderers',
    },
    elements: Object.fromEntries(elements.map(e => [e.element_id, e])),
    elementOrder: elements.map(e => e.element_id),
    narrationLog: [],
    currentNarration: null,
    agentActivity: [],
    summary: null,
    audioByElementId: {},
    audioQueue: [],
    chatHistory: [],
    status: 'streaming',
    error: null,
    writingStatus: 'idle',
    writingElementId: null,
  }

  const addNext = () => {
    if (elements.length >= TEST_ELEMENTS.length) return
    setElements(prev => [...prev, TEST_ELEMENTS[prev.length]])
  }
  const addAll = () => setElements(TEST_ELEMENTS)
  const reset = () => setElements(TEST_ELEMENTS.slice(0, 3))
  const highlightLast = () => {
    setElements(prev => prev.map((e, i) =>
      i === prev.length - 1 ? { ...e, state: 'highlighted' } : { ...e, state: 'normal' },
    ))
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="flex items-center gap-2 px-6 py-3 border-b border-slate-800 bg-slate-900/80">
        <h1 className="text-sm font-semibold">Board Layout Test Harness</h1>
        <span className="text-xs text-slate-400 ml-4">
          {elements.length}/{TEST_ELEMENTS.length} elements
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={addNext}
            className="text-xs px-3 py-1.5 rounded-lg border border-sky-500/60 bg-sky-600/30 text-sky-100 hover:bg-sky-600/50"
            data-testid="btn-add-next"
          >
            Add next
          </button>
          <button
            onClick={addAll}
            className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/60 bg-emerald-600/30 text-emerald-100 hover:bg-emerald-600/50"
            data-testid="btn-add-all"
          >
            Add all
          </button>
          <button
            onClick={highlightLast}
            className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/60 bg-amber-600/30 text-amber-100 hover:bg-amber-600/50"
            data-testid="btn-highlight"
          >
            Highlight latest
          </button>
          <button
            onClick={() => setPaused(p => !p)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700"
            data-testid="btn-pause"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={reset}
            className="text-xs px-3 py-1.5 rounded-lg border border-rose-500/60 bg-rose-600/30 text-rose-100 hover:bg-rose-600/50"
            data-testid="btn-reset"
          >
            Reset
          </button>
        </div>
      </header>
      <main className="flex-1 min-h-0 px-4 sm:px-6 py-4">
        <div className="relative w-full h-[calc(100vh-120px)]">
          <BoardCanvas state={state} paused={paused} />
        </div>
      </main>
    </div>
  )
}
