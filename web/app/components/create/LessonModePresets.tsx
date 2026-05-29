'use client'

import React from 'react'

export type LessonMode = 'speedrun' | 'guided' | 'custom'

export type Verbosity = 'compact' | 'standard' | 'thorough'

export interface LessonDesignValues {
  showThinkingPath: boolean
  enableSeminar: boolean
  enableSimulation: boolean
  enableOralDefense: boolean
  addDeliberateError: boolean
  verbosity: Verbosity
}

/**
 * Preset mapping mirrors `backend/core/lesson_presets.py` — keep these in sync.
 */
export const LESSON_PRESETS: Record<LessonMode, Partial<LessonDesignValues>> = {
  speedrun: {
    showThinkingPath: false,
    enableSeminar: false,
    enableSimulation: false,
    enableOralDefense: true,
    addDeliberateError: true,
    verbosity: 'compact',
  },
  guided: {
    showThinkingPath: true,
    enableSeminar: true,
    enableSimulation: true,
    enableOralDefense: false,
    addDeliberateError: false,
    verbosity: 'thorough',
  },
  custom: {},
}

export function defaultModeForLevel(level: string | null | undefined): LessonMode {
  if (level === 'advanced') return 'speedrun'
  if (level === 'beginner') return 'guided'
  return 'custom'
}

interface Props {
  value: LessonMode
  onChange: (mode: LessonMode) => void
  language?: 'en' | 'zh'
  className?: string
}

const PILL_COPY: Record<LessonMode, { en: string; zh: string; hint_en: string; hint_zh: string; icon: string }> = {
  speedrun: {
    icon: '🏎',
    en: 'Speedrun',
    zh: '速通模式',
    hint_en: 'Compact. Assumes fluency. Skip derivations.',
    hint_zh: '紧凑。默认你已掌握基础。跳过推导。',
  },
  guided: {
    icon: '🌱',
    en: 'Guided',
    zh: '引导模式',
    hint_en: 'First principles. Worked examples. More scaffolding.',
    hint_zh: '从基础讲起。示范题。更多支架。',
  },
  custom: {
    icon: '⚙️',
    en: 'Customize',
    zh: '自定义',
    hint_en: 'Pick every toggle yourself.',
    hint_zh: '逐项自定义开关。',
  },
}

export default function LessonModePresets({ value, onChange, language = 'en', className = '' }: Props) {
  const modes: LessonMode[] = ['speedrun', 'guided', 'custom']
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="text-xs uppercase tracking-wide text-slate-400">
        {language === 'zh' ? '学习模式' : 'Lesson mode'}
      </div>
      <div role="radiogroup" className="flex flex-wrap gap-2">
        {modes.map(mode => {
          const active = value === mode
          const copy = PILL_COPY[mode]
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(mode)}
              className={`text-left px-3 py-2 rounded-lg border transition ${
                active
                  ? 'bg-indigo-500/20 border-indigo-400 text-indigo-100'
                  : 'bg-slate-800/60 border-slate-600 text-slate-200 hover:border-slate-400'
              }`}
            >
              <div className="text-sm font-medium">
                <span aria-hidden="true" className="mr-1">{copy.icon}</span>
                {language === 'zh' ? copy.zh : copy.en}
              </div>
              <div className="text-[11px] opacity-80 mt-0.5">
                {language === 'zh' ? copy.hint_zh : copy.hint_en}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
