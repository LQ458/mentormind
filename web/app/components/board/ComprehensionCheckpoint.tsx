'use client'

import React, { useState } from 'react'

export type CheckpointResponse = 'green' | 'yellow' | 'red'

interface Props {
  question?: string
  options?: string[]
  segmentSummary?: string
  onSubmit: (args: { response: CheckpointResponse; mcqChoice: number | null }) => void
  onSkip?: () => void
  language?: 'en' | 'zh'
}

const EMOJI: Record<CheckpointResponse, { label_en: string; label_zh: string; emoji: string; color: string }> = {
  green: {
    emoji: '🟢',
    label_en: 'Clear, keep going',
    label_zh: '清楚，继续',
    color: 'border-emerald-400 hover:bg-emerald-500/20',
  },
  yellow: {
    emoji: '🟡',
    label_en: 'Okay-ish',
    label_zh: '大致明白',
    color: 'border-amber-400 hover:bg-amber-500/20',
  },
  red: {
    emoji: '🔴',
    label_en: "Lost — explain differently",
    label_zh: '没懂 — 换一种讲法',
    color: 'border-rose-400 hover:bg-rose-500/20',
  },
}

export default function ComprehensionCheckpoint({
  question,
  options,
  segmentSummary,
  onSubmit,
  onSkip,
  language = 'en',
}: Props) {
  const [mcqChoice, setMcqChoice] = useState<number | null>(null)

  const submit = (response: CheckpointResponse) => {
    onSubmit({ response, mcqChoice })
  }

  const hasMcq = Boolean(question) && Array.isArray(options) && options.length > 0

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={language === 'zh' ? '学习检查点' : 'Comprehension checkpoint'}
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
    >
      <div className="max-w-lg w-full mx-4 rounded-xl border border-slate-700 bg-slate-900/90 p-5 shadow-xl">
        <div className="text-xs uppercase tracking-wide text-indigo-300 mb-2">
          {language === 'zh' ? '学习检查点' : 'Quick check-in'}
        </div>
        {segmentSummary ? (
          <div className="text-sm text-slate-300 mb-3">
            {language === 'zh' ? '刚才讲的是：' : 'Just covered:'} <span className="text-slate-100">{segmentSummary}</span>
          </div>
        ) : null}

        {hasMcq ? (
          <div className="mb-4">
            <div className="text-sm text-slate-100 mb-2">{question}</div>
            <div className="flex flex-col gap-1.5">
              {options!.map((opt, idx) => (
                <label
                  key={idx}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer ${
                    mcqChoice === idx
                      ? 'border-indigo-400 bg-indigo-500/15'
                      : 'border-slate-700 hover:border-slate-500'
                  }`}
                >
                  <input
                    type="radio"
                    name="mcq"
                    checked={mcqChoice === idx}
                    onChange={() => setMcqChoice(idx)}
                    className="accent-indigo-500"
                  />
                  <span className="text-sm text-slate-200">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 mt-2">
          {(Object.keys(EMOJI) as CheckpointResponse[]).map(k => {
            const meta = EMOJI[k]
            return (
              <button
                key={k}
                type="button"
                onClick={() => submit(k)}
                className={`px-3 py-2 rounded-lg border bg-slate-800/70 text-slate-100 text-sm ${meta.color}`}
              >
                <span aria-hidden="true" className="mr-1">{meta.emoji}</span>
                {language === 'zh' ? meta.label_zh : meta.label_en}
              </button>
            )
          })}
          {onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              className="ml-auto px-3 py-2 rounded-lg border border-slate-600 text-slate-400 hover:text-slate-200 text-sm"
            >
              {language === 'zh' ? '跳过' : 'Skip'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
