export interface GraphNode {
  id: string
  label: string
  x: number
  y: number
  m?: number
  active?: boolean
  future?: boolean
}

export interface GraphData {
  nodes: GraphNode[]
  edges: [string, string][]
}

const DEFAULT_GRAPH: GraphData = {
  nodes: [
    { id: 'quad', label: 'Quadratics', x: 360, y: 180, m: 0.64, active: true },
    { id: 'disc', label: 'Discriminant', x: 550, y: 110, m: 0.34 },
    { id: 'vieta', label: "Vieta's", x: 560, y: 240, m: 0.71 },
    { id: 'cs', label: 'Completing square', x: 200, y: 110, m: 0.74 },
    { id: 'roots', label: 'Roots', x: 370, y: 320, m: 0.58 },
    { id: 'func', label: 'Functions', x: 160, y: 260, m: 0.66 },
    { id: 'graph', label: 'Parabola', x: 360, y: 50, m: 0.62 },
    { id: 'sys', label: 'Systems', x: 180, y: 380, m: 0.48 },
    { id: 'comp', label: 'Complex', x: 700, y: 180, m: 0.18, future: true },
  ],
  edges: [
    ['quad', 'disc'],
    ['quad', 'vieta'],
    ['quad', 'cs'],
    ['quad', 'roots'],
    ['quad', 'graph'],
    ['func', 'quad'],
    ['cs', 'roots'],
    ['disc', 'roots'],
    ['roots', 'sys'],
    ['disc', 'comp'],
  ],
}

export default function KnowledgeGraph({ data = DEFAULT_GRAPH }: { data?: GraphData }) {
  const w = 400
  const h = 280
  const pad = 30
  const xs = data.nodes.map((n) => n.x)
  const ys = data.nodes.map((n) => n.y)
  const mnX = Math.min(...xs)
  const mxX = Math.max(...xs)
  const mnY = Math.min(...ys)
  const mxY = Math.max(...ys)
  const sx = (x: number) =>
    pad + ((x - mnX) / Math.max(1, mxX - mnX)) * (w - pad * 2)
  const sy = (y: number) =>
    pad + ((y - mnY) / Math.max(1, mxY - mnY)) * (h - pad * 2)
  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]))

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {data.edges.map(([a, b], i) => {
        const na = byId[a]
        const nb = byId[b]
        if (!na || !nb) return null
        const dashed = na.future || nb.future
        return (
          <line
            key={i}
            x1={sx(na.x)}
            y1={sy(na.y)}
            x2={sx(nb.x)}
            y2={sy(nb.y)}
            stroke="var(--line-strong)"
            strokeWidth={dashed ? 1 : 1.5}
            strokeDasharray={dashed ? '3 3' : ''}
          />
        )
      })}
      {data.nodes.map((n) => {
        const cx = sx(n.x)
        const cy = sy(n.y)
        const r = 8 + (n.m || 0) * 6
        const col = n.active ? 'var(--accent)' : 'var(--ink)'
        const fill = n.active ? 'var(--accent)' : n.future ? 'var(--surface-2)' : 'var(--surface)'
        return (
          <g key={n.id}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={fill}
              stroke={col}
              strokeWidth={n.active ? 2 : 1.3}
              opacity={n.future ? 0.5 : 1}
            />
            <text
              x={cx}
              y={cy + r + 12}
              textAnchor="middle"
              fontFamily="var(--sans)"
              fontSize="10"
              fill="var(--ink-2)"
              opacity={n.future ? 0.6 : 1}
              fontWeight={n.active ? 500 : 400}
            >
              {n.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
