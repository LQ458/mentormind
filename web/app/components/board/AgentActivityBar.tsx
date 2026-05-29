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
          const humanize = (v: unknown): string => {
            if (v == null) return ''
            if (typeof v === 'string') {
              // Backend sometimes emits the agent result as a JSON-encoded
              // string ("{\"facts\":[...]}"). Parse on-the-fly so we can
              // surface a readable summary instead of the raw blob.
              const trimmed = v.trim()
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try { return humanize(JSON.parse(trimmed)) } catch { /* fallthrough */ }
              }
              return v
            }
            if (typeof v === 'number' || typeof v === 'boolean') return String(v)
            if (typeof v === 'object') {
              const obj = v as Record<string, unknown>
              if (Array.isArray(obj.facts) && obj.facts.length > 0) {
                return `${String(obj.facts[0])}${obj.facts.length > 1 ? ` (+${obj.facts.length - 1} more)` : ''}`
              }
              if (typeof obj.summary === 'string') return obj.summary
              if (typeof obj.text === 'string') return obj.text
              if (typeof obj.message === 'string') return obj.message
              if (typeof obj.language === 'string' && typeof obj.code === 'string') {
                const lines = obj.code.split('\n').length
                return `generated ${String(obj.language)} code · ${lines} line${lines === 1 ? '' : 's'}`
              }
              if (typeof obj.code === 'string') return `code: ${obj.code.split('\n')[0] || ''}`
              if (typeof obj.critique === 'string') return obj.critique
              try { return JSON.stringify(obj) } catch { return String(obj) }
            }
            return String(v)
          }
          const raw =
            ev.kind === 'start'
              ? humanize(ev.task) || '…'
              : ev.kind === 'error'
                ? (humanize(ev.error) || 'failed')
                : humanize(ev.result)
          const text = raw.length > 80 ? `${raw.slice(0, 77)}…` : raw
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
