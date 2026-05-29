'use client'

import React, { useState } from 'react'
import { useKeyboardShortcut, SHORTCUTS_REGISTRY } from '../hooks/useKeyboardShortcut'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useLanguage } from './LanguageContext'

const KEY_LABELS: Record<string, { zh: string; en: string }> = {
  '?': { zh: '问号 ?', en: '?' },
  ' ': { zh: '空格', en: 'Space' },
  Enter: { zh: '回车', en: 'Enter' },
  Escape: { zh: 'Esc', en: 'Esc' },
}

const DESCRIPTIONS: Record<string, { zh: string; en: string }> = {
  'Show shortcuts help': { zh: '显示快捷键帮助', en: 'Show shortcuts help' },
  'Close modal / panel': { zh: '关闭弹窗/面板', en: 'Close modal / panel' },
  'Pause / resume lesson (board only)': { zh: '暂停/恢复讲课（仅白板页）', en: 'Pause / resume lesson (board only)' },
  'Send message': { zh: '发送消息', en: 'Send message' },
}

export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false)
  const { language } = useLanguage()
  const lang = language === 'zh' ? 'zh' : 'en'
  const trapRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: () => setOpen(false) })

  useKeyboardShortcut(
    { key: '?', shift: true, ignoreInputs: true },
    () => setOpen((v) => !v)
  )
  useKeyboardShortcut(
    { key: '/', meta: true, ignoreInputs: false },
    () => setOpen((v) => !v)
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
      onClick={() => setOpen(false)}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={lang === 'zh' ? '快捷键' : 'Keyboard shortcuts'}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full rounded-xl border border-slate-300 bg-white shadow-2xl overflow-hidden focus:outline-none"
      >
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            {lang === 'zh' ? '键盘快捷键' : 'Keyboard shortcuts'}
          </h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-500 hover:text-slate-900"
            aria-label={lang === 'zh' ? '关闭' : 'Close'}
          >
            ✕
          </button>
        </div>
        <ul className="divide-y divide-slate-100">
          {SHORTCUTS_REGISTRY.map((s, i) => {
            const keyLabel = KEY_LABELS[s.key]?.[lang] ?? s.key
            const modifiers = [
              s.meta && (lang === 'zh' ? '⌘ / Ctrl' : '⌘/Ctrl'),
              s.shift && 'Shift',
              s.alt && 'Alt',
            ].filter(Boolean) as string[]
            const desc = DESCRIPTIONS[s.description]?.[lang] ?? s.description
            return (
              <li key={i} className="px-5 py-3 flex items-center justify-between gap-4">
                <span className="text-sm text-slate-700">{desc}</span>
                <span className="flex items-center gap-1">
                  {modifiers.map((m) => (
                    <kbd key={m} className="px-2 py-0.5 text-xs font-mono bg-slate-100 border border-slate-300 rounded">
                      {m}
                    </kbd>
                  ))}
                  {modifiers.length > 0 && <span className="text-slate-400 text-xs">+</span>}
                  <kbd className="px-2 py-0.5 text-xs font-mono bg-slate-100 border border-slate-300 rounded">
                    {keyLabel}
                  </kbd>
                </span>
              </li>
            )
          })}
        </ul>
        <div className="px-5 py-2 bg-slate-50 text-xs text-slate-500 text-center border-t border-slate-200">
          {lang === 'zh' ? '按 ? 随时再次打开' : 'Press ? to open again'}
        </div>
      </div>
    </div>
  )
}
