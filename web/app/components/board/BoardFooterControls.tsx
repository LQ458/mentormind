'use client'

import React from 'react'
import VoiceInput from './VoiceInput'

interface BoardFooterControlsProps {
  language: string
  draft: string
  onDraftChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSend: () => void
  canAskTeacher: boolean
}

/**
 * The "ask the teacher" composer pinned to the bottom of the board page (voice
 * input + textarea + send). Extracted from the page to keep it under the
 * file-size cap.
 */
export default function BoardFooterControls({
  language,
  draft,
  onDraftChange,
  onKeyDown,
  onSend,
  canAskTeacher,
}: BoardFooterControlsProps) {
  return (
    <footer className="border-t border-slate-800 bg-slate-900/80 backdrop-blur px-4 sm:px-6 py-3">
      <div className="flex flex-wrap items-start gap-2 sm:gap-3">
        <VoiceInput
          language={language === 'zh' ? 'zh-CN' : 'en-US'}
          onTranscript={(text, isFinal) => {
            if (isFinal) onDraftChange((draft ? draft + ' ' : '') + text)
          }}
        />
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={
            !canAskTeacher
              ? (language === 'zh' ? 'Mina 正在准备板书…' : 'Mina is preparing the board…')
              : language === 'zh'
                ? '向 AI 老师提问…（回车发送，Shift+回车换行）'
                : 'Ask the AI teacher anything… (Enter to send, Shift+Enter for newline)'
          }
          className="flex-1 min-w-[180px] text-sm bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder:text-slate-500 resize-none"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!draft.trim() || !canAskTeacher}
          className="whitespace-nowrap text-xs px-3 sm:px-4 py-2 rounded-lg border border-sky-500/70 bg-sky-600/40 text-sky-50 hover:bg-sky-600/60 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {language === 'zh' ? '发送' : 'Send'}
        </button>
      </div>
    </footer>
  )
}
