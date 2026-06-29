'use client'

import React, { useState } from 'react'
import type { ComprehensionCheckData } from '../../hooks/useBoardWebSocket'
import ComprehensionCheckpoint, { CheckpointResponse } from './ComprehensionCheckpoint'

interface BoardRecapCheckProps {
  check: ComprehensionCheckData | null | undefined
  language: string
  /** Send a learner message into the lesson (the WS sendUserMessage). */
  onAsk: (text: string) => void
}

/**
 * Phase 1b — end-of-lesson recap. Renders the (de-modaled) ComprehensionCheckpoint
 * inline and non-blocking: the learner does a quick free recall + self-rating, or
 * skips. A "lost" rating sends a templated request for a simpler re-explanation.
 * Dismissal is local — the recap is a one-shot at lesson end.
 */
export default function BoardRecapCheck({ check, language, onAsk }: BoardRecapCheckProps) {
  const [dismissed, setDismissed] = useState(false)
  if (!check || dismissed) return null
  const zh = language === 'zh'

  const handleSubmit = ({ response }: { response: CheckpointResponse; mcqChoice: number | null }) => {
    if (response === 'red') {
      onAsk(
        zh
          ? '这节课我还没太懂，能用更简单的方式再讲讲最关键的一点吗？'
          : "I'm still not sure I got this — can you re-explain the key idea more simply?",
      )
    }
    setDismissed(true)
  }

  return (
    <ComprehensionCheckpoint
      question={check.question}
      options={check.options}
      segmentSummary={check.segment_summary}
      onSubmit={handleSubmit}
      onSkip={() => setDismissed(true)}
      language={zh ? 'zh' : 'en'}
    />
  )
}
