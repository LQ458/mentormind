'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useLanguage } from '../LanguageContext'

interface PlanSummary {
  id: string
  title: string
  subject: string
  status: string
  progress_percentage: number
  updated_at: string | null
}

interface PlanUnit {
  id: string
  title: string
  order_index: number
  topics: string[]
  is_completed: boolean
  content_status: string
}

interface PlanDetail {
  id: string
  title: string
  units: PlanUnit[]
}

interface PositionedNode {
  id: string
  label: string
  m: number
  active: boolean
  future: boolean
  isPlan: boolean
  href: string
  x: number
  y: number
  // For label placement: 'left' | 'right' | 'above' | 'below'
  labelSide: 'left' | 'right' | 'above' | 'below'
}

interface PositionedLink {
  a: string
  b: string
  dashed: boolean
}

const W = 600
const H = 400
const CENTER_X = W / 2
const CENTER_Y = H / 2
const RING_RADIUS_X = 220
const RING_RADIUS_Y = 130

function buildPlanGraph(plan: PlanDetail): {
  nodes: PositionedNode[]
  links: PositionedLink[]
} {
  const units = [...(plan.units || [])].sort((a, b) => a.order_index - b.order_index)
  const nodes: PositionedNode[] = []
  const links: PositionedLink[] = []

  const planNodeId = `plan:${plan.id}`
  nodes.push({
    id: planNodeId,
    label: plan.title,
    m: 1,
    active: true,
    future: false,
    isPlan: true,
    href: `/study-plan/${plan.id}`,
    x: CENTER_X,
    y: CENTER_Y,
    labelSide: 'below',
  })

  if (units.length === 0) return { nodes, links }

  units.forEach((u, i) => {
    // Distribute units around an ellipse, starting at top and going clockwise
    const angle = (-Math.PI / 2) + (i / units.length) * Math.PI * 2
    const x = CENTER_X + Math.cos(angle) * RING_RADIUS_X
    const y = CENTER_Y + Math.sin(angle) * RING_RADIUS_Y
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    let labelSide: PositionedNode['labelSide']
    if (Math.abs(sinA) > 0.85) labelSide = sinA > 0 ? 'below' : 'above'
    else labelSide = cosA >= 0 ? 'right' : 'left'

    const topicCount = Array.isArray(u.topics) ? u.topics.length : 0
    const unitNodeId = `unit:${plan.id}:${u.id}`
    nodes.push({
      id: unitNodeId,
      label: u.title,
      m: Math.min(1, topicCount / 8),
      active: false,
      future: !u.is_completed,
      isPlan: false,
      href: `/study-plan/${plan.id}`,
      x,
      y,
      labelSide,
    })

    // Plan → first unit; then sequential unit chain
    if (i === 0) {
      links.push({ a: planNodeId, b: unitNodeId, dashed: !u.is_completed })
    } else {
      links.push({
        a: `unit:${plan.id}:${units[i - 1].id}`,
        b: unitNodeId,
        dashed: !u.is_completed,
      })
    }
  })

  return { nodes, links }
}

function pickInitialPlan(plans: PlanSummary[]): string | null {
  if (plans.length === 0) return null
  let best = plans[0]
  for (const p of plans) {
    if (!p.updated_at) continue
    if (!best.updated_at || (p.updated_at || '') > (best.updated_at || '')) best = p
  }
  return best.id
}

export default function KnowledgeGraph() {
  const { language } = useLanguage()
  const { getToken, isSignedIn, isLoaded } = useAuth()
  const lang = language === 'zh' ? 'zh' : 'en'

  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [details, setDetails] = useState<Record<string, PlanDetail | null>>({})
  const [loading, setLoading] = useState(true)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!isLoaded) return
      if (!isSignedIn) {
        setLoading(false)
        return
      }
      try {
        const token = await getToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`

        const res = await fetch('/api/backend/study-plan/my-plans', {
          headers,
          cache: 'no-store',
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = await res.json()
        const list: PlanSummary[] = Array.isArray(data?.plans) ? data.plans : []
        if (cancelled) return
        setPlans(list)
        setSelectedPlanId((prev) => prev ?? pickInitialPlan(list))

        if (list.length === 0) {
          setDetails({})
          return
        }

        const detailEntries = await Promise.all(
          list.map(async (p) => {
            try {
              const r = await fetch(`/api/backend/study-plan/${p.id}`, {
                headers,
                cache: 'no-store',
              })
              if (!r.ok) return [p.id, null] as const
              const payload = await r.json()
              const planObj = payload?.plan ?? payload
              if (!planObj || !Array.isArray(planObj.units)) return [p.id, null] as const
              return [
                p.id,
                {
                  id: planObj.id,
                  title: planObj.title,
                  units: planObj.units as PlanUnit[],
                },
              ] as const
            } catch {
              return [p.id, null] as const
            }
          }),
        )
        if (cancelled) return
        const map: Record<string, PlanDetail | null> = {}
        for (const [id, d] of detailEntries) map[id] = d
        setDetails(map)
      } catch {
        if (!cancelled) {
          setPlans([])
          setDetails({})
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [isLoaded, isSignedIn, getToken])

  const selectedPlanDetail: PlanDetail | null = useMemo(() => {
    if (!selectedPlanId) return null
    return details[selectedPlanId] ?? null
  }, [selectedPlanId, details])

  const { nodes, links } = useMemo(() => {
    if (!selectedPlanDetail) return { nodes: [], links: [] }
    return buildPlanGraph(selectedPlanDetail)
  }, [selectedPlanDetail])

  if (loading) {
    return (
      <div
        style={{
          height: 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink-2)',
          fontSize: 13,
        }}
      >
        {lang === 'zh' ? '加载学习计划图谱…' : 'Loading study plan graph…'}
      </div>
    )
  }

  if (plans.length === 0) {
    return (
      <div
        style={{
          padding: '32px 16px',
          textAlign: 'center',
          color: 'var(--ink-2)',
          fontSize: 13,
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }} aria-hidden>
          🗺️
        </div>
        <div style={{ marginBottom: 8 }}>
          {lang === 'zh'
            ? '还没有学习计划。创建一个，AI 会把单元和主题映射进图谱。'
            : 'No study plans yet. Create one and the AI will map its units and topics into a graph.'}
        </div>
      </div>
    )
  }

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const showSwitcher = plans.length > 1
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0]

  return (
    <div>
      {showSwitcher && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 10,
          }}
        >
          {plans.map((p) => {
            const isActive = p.id === selectedPlanId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlanId(p.id)}
                style={{
                  border: isActive ? '1px solid var(--accent)' : '1px solid var(--line)',
                  background: isActive ? 'var(--accent-soft, #eef2ff)' : 'var(--surface)',
                  color: isActive ? 'var(--accent)' : 'var(--ink-2)',
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  fontWeight: isActive ? 500 : 400,
                  maxWidth: 220,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                aria-pressed={isActive}
                title={p.title}
              >
                {p.title}
              </button>
            )
          })}
        </div>
      )}

      {!selectedPlanDetail || nodes.length <= 1 ? (
        <div
          style={{
            padding: '20px 16px',
            textAlign: 'center',
            color: 'var(--ink-2)',
            fontSize: 12,
          }}
        >
          {lang === 'zh'
            ? `「${selectedPlan?.title ?? ''}」还没有单元，无法绘制图谱。`
            : `"${selectedPlan?.title ?? ''}" has no units yet, so the graph is empty.`}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          role="img"
          aria-label={lang === 'zh' ? '学习计划图谱' : 'Study plan graph'}
        >
          {links.map((l, i) => {
            const a = byId[l.a]
            const b = byId[l.b]
            if (!a || !b) return null
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--line-strong)"
                strokeWidth={l.dashed ? 1 : 1.5}
                strokeDasharray={l.dashed ? '3 3' : undefined}
              />
            )
          })}
          {nodes.map((n) => {
            const r = n.isPlan ? 14 + n.m * 4 : 7 + n.m * 5
            const col = n.active ? 'var(--accent)' : n.isPlan ? 'var(--ink)' : 'var(--ink-2)'
            const fill = n.active
              ? 'var(--accent)'
              : n.isPlan
                ? 'var(--surface-2)'
                : n.future
                  ? 'var(--surface-2)'
                  : 'var(--surface)'
            // Label placement: position outside the circle so labels don't
            // overlap with siblings.
            let lx = n.x
            let ly = n.y
            let textAnchor: 'start' | 'middle' | 'end' = 'middle'
            const pad = r + 6
            if (n.labelSide === 'right') {
              lx = n.x + pad
              ly = n.y + 4
              textAnchor = 'start'
            } else if (n.labelSide === 'left') {
              lx = n.x - pad
              ly = n.y + 4
              textAnchor = 'end'
            } else if (n.labelSide === 'above') {
              ly = n.y - pad - 2
              textAnchor = 'middle'
            } else {
              ly = n.y + pad + 10
              textAnchor = 'middle'
            }
            return (
              <g key={n.id}>
                <Link href={n.href} style={{ cursor: 'pointer' }}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r}
                    fill={fill}
                    stroke={col}
                    strokeWidth={n.active || n.isPlan ? 2 : 1.3}
                    opacity={n.future ? 0.55 : 1}
                  />
                  <text
                    x={lx}
                    y={ly}
                    textAnchor={textAnchor}
                    fontFamily="var(--sans)"
                    fontSize={n.isPlan ? 12 : 10}
                    fill="var(--ink-2)"
                    opacity={n.future ? 0.7 : 1}
                    fontWeight={n.active || n.isPlan ? 500 : 400}
                    paintOrder="stroke"
                    stroke="var(--surface, #fff)"
                    strokeWidth={3}
                    style={{ pointerEvents: 'none' }}
                  >
                    {truncate(n.label, n.isPlan ? 30 : 22)}
                  </text>
                </Link>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

function truncate(s: string, n: number): string {
  if (!s) return ''
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}
