import React from 'react'

export function PageHead({
  eyebrow,
  title,
  kicker,
}: {
  eyebrow?: string
  title: string
  kicker?: string
}) {
  return (
    <div className="page-head-new">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {kicker && <div className="kicker">{kicker}</div>}
    </div>
  )
}

export function Section({
  title,
  tools,
  children,
}: {
  title: string
  tools?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="section-title">
        <h2>{title}</h2>
        {tools && <div className="tools">{tools}</div>}
      </div>
      {children}
    </div>
  )
}

export function Progress({
  value,
  thin,
  strong,
}: {
  value: number
  thin?: boolean
  strong?: boolean
}) {
  const cls = `progress ${thin ? 'thin' : ''} ${strong ? 'strong' : ''}`.trim()
  return (
    <div className={cls}>
      <div
        className="fill"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  )
}

export function Chip({
  children,
  kind,
  dot,
}: {
  children: React.ReactNode
  kind?: 'accent' | 'ok' | 'warn' | ''
  dot?: boolean
}) {
  return (
    <span className={`chip ${kind || ''}`.trim()}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}
