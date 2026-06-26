'use client'

import React from 'react'
import ExplainDifferentlyButton, { StyleHint } from './ExplainDifferentlyButton'

interface BoardHelpControlsProps {
  /** Send a learner message into the lesson (typically the WS sendUserMessage). */
  onAsk: (text: string) => void
  /** Disabled until the board is ready to take questions. */
  canAsk: boolean
  language: string
}

const EXPLAIN_ZH: Record<StyleHint, string> = {
  simpler: '能用更简单的方式，把刚才那部分再讲一遍吗？',
  visual: '能更形象一点、配合图示，把刚才那部分再讲一遍吗？',
  analogy: '能用一个类比来解释刚才那部分吗？',
  rigorous: '能更严谨地把刚才那部分再讲一遍吗？',
}

const EXPLAIN_EN: Record<StyleHint, string> = {
  simpler: 'Can you re-explain that last part more simply?',
  visual: 'Can you re-explain that last part more visually, with a diagram?',
  analogy: 'Can you explain that last part using an analogy?',
  rigorous: 'Can you re-explain that last part more rigorously?',
}

/**
 * Learner-pull help affordances for the board lesson (Phase 1b): "explain
 * differently" (re-teach the last part in a chosen style) and "why this step".
 * Both are non-blocking — they just send a templated student question through
 * the existing chat channel, which the orchestrator answers inline (the prompt's
 * "Handling Student Questions" flow) without restarting the lesson.
 */
export default function BoardHelpControls({ onAsk, canAsk, language }: BoardHelpControlsProps) {
  const zh = language === 'zh'

  const handleExplain = (hint: StyleHint) => {
    if (!canAsk) return
    onAsk(zh ? EXPLAIN_ZH[hint] : EXPLAIN_EN[hint])
  }

  const handleWhy = () => {
    if (!canAsk) return
    onAsk(
      zh
        ? '为什么是这一步？能解释一下刚才这步背后的原因吗？'
        : 'Why this step? Can you explain the reasoning behind what you just did?',
    )
  }

  return (
    <div className="inline-flex items-center gap-2">
      <ExplainDifferentlyButton
        onRequest={handleExplain}
        disabled={!canAsk}
        language={zh ? 'zh' : 'en'}
      />
      <button
        type="button"
        onClick={handleWhy}
        disabled={!canAsk}
        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
        title={zh ? '问“为什么是这一步”' : 'Ask why this step'}
      >
        {zh ? '为什么这步' : 'Why this step'}
      </button>
    </div>
  )
}
