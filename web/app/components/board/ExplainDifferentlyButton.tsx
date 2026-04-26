'use client'

import React, { useState } from 'react'

export type StyleHint = 'visual' | 'analogy' | 'rigorous' | 'simpler'

interface Props {
  onRequest: (styleHint: StyleHint) => void
  disabled?: boolean
  language?: 'en' | 'zh'
}

const OPTIONS: { value: StyleHint; label_en: string; label_zh: string; icon: string }[] = [
  { value: 'simpler', label_en: 'Simpler', label_zh: '更简单', icon: '🪶' },
  { value: 'visual', label_en: 'More visual', label_zh: '更形象', icon: '🖼' },
  { value: 'analogy', label_en: 'Use an analogy', label_zh: '用类比', icon: '💡' },
  { value: 'rigorous', label_en: 'More rigorous', label_zh: '更严谨', icon: '📐' },
]

export default function ExplainDifferentlyButton({ onRequest, disabled, language = 'en' }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {language === 'zh' ? '换一种讲法' : 'Explain differently'}
      </button>
      {open && !disabled ? (
        <div
          role="menu"
          className="absolute right-0 mt-1 z-30 w-56 rounded-lg border border-slate-600 bg-slate-900/95 shadow-xl py-1"
        >
          {OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onRequest(opt.value)
              }}
              className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 flex items-center gap-2"
            >
              <span aria-hidden="true">{opt.icon}</span>
              <span>{language === 'zh' ? opt.label_zh : opt.label_en}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
