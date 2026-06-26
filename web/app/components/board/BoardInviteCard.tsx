'use client'

import React from 'react'
import type { SegmentInvite } from '../../hooks/useBoardWebSocket'

interface BoardInviteCardProps {
  invite: SegmentInvite
  language: string
  /** Send a templated learner message into the lesson (the WS sendUserMessage). */
  onSend: (text: string) => void
  /** Dismiss the invite so it doesn't reappear. */
  onDismiss: () => void
}

const KIND_LABEL_ZH: Record<SegmentInvite['kind'], string> = {
  predict: '想一想',
  choose: '选一选',
  restate: '说一说',
  do_step: '试一试',
}

const KIND_LABEL_EN: Record<SegmentInvite['kind'], string> = {
  predict: 'Predict',
  choose: 'Choose',
  restate: 'Restate',
  do_step: 'Try it',
}

/**
 * Phase 1b — non-blocking inline invite. Rendered near the Continue control to
 * nudge the learner to engage with a quick prompt. It is strictly optional: it
 * never disables/hides the Continue control and the lesson is never gated on a
 * response. Picking an option / responding sends a templated student message
 * through the existing chat channel and dismisses; Skip just dismisses.
 */
export default function BoardInviteCard({
  invite,
  language,
  onSend,
  onDismiss,
}: BoardInviteCardProps) {
  const zh = language === 'zh'

  const respond = (text: string) => {
    const trimmed = text.trim()
    if (trimmed) onSend(trimmed)
    onDismiss()
  }

  const label = zh ? KIND_LABEL_ZH[invite.kind] : KIND_LABEL_EN[invite.kind]
  const isChoose = invite.kind === 'choose' && Array.isArray(invite.options) && invite.options.length > 0

  return (
    <div
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 w-[min(92%,28rem)]"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl border border-sky-400/50 bg-slate-900/90 px-4 py-3 shadow-xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full border border-sky-400/50 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-200">
            {label}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-slate-400 hover:text-slate-200"
            aria-label={zh ? '跳过' : 'Skip'}
          >
            {zh ? '跳过' : 'Skip'}
          </button>
        </div>
        <p className="text-sm text-slate-100">{invite.prompt}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {isChoose ? (
            invite.options!.map((opt, i) => (
              <button
                key={`${opt}-${i}`}
                type="button"
                onClick={() => respond(zh ? `我的想法：${opt}` : `My answer: ${opt}`)}
                className="rounded-lg border border-emerald-400/60 bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-600/40"
              >
                {opt}
              </button>
            ))
          ) : (
            <button
              type="button"
              onClick={() => respond(zh ? '我先想一想……' : 'Let me think about that first…')}
              className="rounded-lg border border-emerald-400/60 bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-600/40"
            >
              {zh ? '回应' : 'Respond'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
