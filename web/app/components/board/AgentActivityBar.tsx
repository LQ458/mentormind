'use client'

import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AgentEvent } from '../../hooks/useBoardWebSocket'

interface AgentActivityBarProps {
  activity: AgentEvent[]
}

const AGENT_ICON: Record<AgentEvent['agent'], string> = {
  researcher: '🔍',
  coder: '💻',
  writer: '✍️',
  critic: '🧐',
}

const AGENT_LABEL: Record<AgentEvent['agent'], string> = {
  researcher: 'Researcher',
  coder: 'Coder',
  writer: 'Writer',
  critic: 'Critic',
}

export default function AgentActivityBar({ activity }: AgentActivityBarProps) {
  const visible = activity.slice(-3)
  if (visible.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AnimatePresence>
        {visible.map((ev, idx) => {
          const key = `${ev.agent}-${ev.timestamp}-${idx}`
          const label = AGENT_LABEL[ev.agent] || ev.agent
          const icon = AGENT_ICON[ev.agent] || '•'
          const toStr = (v: unknown): string => {
            if (typeof v === 'string') return v
            if (v == null) return ''
            try { return JSON.stringify(v) } catch { return String(v) }
          }
          const text =
            ev.kind === 'start'
              ? toStr(ev.task) || '…'
              : ev.kind === 'error'
                ? (toStr(ev.error) || 'failed').slice(0, 80)
                : toStr(ev.result).slice(0, 80)
          const palette =
            ev.kind === 'start'
              ? 'border-sky-400/60 bg-sky-500/20 text-sky-100'
              : ev.kind === 'error'
                ? 'border-rose-400/60 bg-rose-500/20 text-rose-100'
                : 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${palette}`}
            >
              <span aria-hidden>{icon}</span>
              <span className="font-semibold">{label}:</span>
              <span className="truncate max-w-[240px]">{text}</span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
