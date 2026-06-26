'use client'

import React, { useEffect, useRef } from 'react'
import type { BoardStatus, ChatMessage } from '../../hooks/useBoardWebSocket'
import { FeedbackMoment } from '../FeedbackMoment'

interface BoardChatPanelProps {
  chatHistory: ChatMessage[]
  language: string
  sessionId: string
  status: BoardStatus
  hasBoard: boolean
  elementCount: number
  title: string
  activeNarrationElementId: string | null
}

/**
 * The mid-lesson chat transcript shown beside the board. Extracted from the
 * board page so the page stays under the file-size cap; owns its own scroll ref
 * and auto-scroll-to-newest effect.
 */
export default function BoardChatPanel({
  chatHistory,
  language,
  sessionId,
  status,
  hasBoard,
  elementCount,
  title,
  activeNarrationElementId,
}: BoardChatPanelProps) {
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  // Keep the chat log pinned to the newest message when it grows.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [chatHistory.length])

  return (
    <aside className="w-full lg:w-[340px] lg:shrink-0 flex flex-col border border-slate-800 bg-slate-900/60 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
        {language === 'zh' ? '与老师对话' : 'Chat with the teacher'}
      </div>
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-2 text-sm"
      >
        {chatHistory.length === 0 ? (
          <p className="text-slate-500 text-xs italic">
            {language === 'zh'
              ? '想到哪里问到哪里——语音或打字都行，AI 会在板书上回答。'
              : 'Ask anything mid-lesson by voice or text — the AI replies on the board.'}
          </p>
        ) : (
          chatHistory.map((m, i) => (
            <div
              key={`${m.timestamp}-${i}`}
              className={
                m.role === 'user'
                  ? 'ml-6 rounded-lg bg-sky-600/20 border border-sky-500/40 px-3 py-2 text-sky-100'
                  : 'mr-6 rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-slate-200'
              }
            >
              <div className="text-[10px] uppercase tracking-wide mb-0.5 opacity-60">
                {m.role === 'user'
                  ? (language === 'zh' ? '我' : 'You')
                  : (language === 'zh' ? 'AI 老师' : 'AI Teacher')}
              </div>
              <div className="whitespace-pre-wrap break-words">{m.text}</div>
              {m.role === 'assistant' && (
                <div className="mt-2">
                  <FeedbackMoment
                    surface="board_teacher_reply"
                    interactionId={`board-teacher-reply-${sessionId}-${m.timestamp}-${i}`}
                    snapshot={{
                      board_session_id: sessionId,
                      board_status: status,
                      message_index: i,
                      message_length: m.text.length,
                      element_count: elementCount,
                      has_board: hasBoard,
                      lesson_title: title,
                      active_narration_element_id: activeNarrationElementId,
                    }}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
