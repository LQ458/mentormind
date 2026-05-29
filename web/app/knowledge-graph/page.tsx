'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useAuth } from '../components/AuthContext'
import { useLanguage } from '../components/LanguageContext'
import { PageHead } from '../components/design/primitives'
import { Skeleton } from '../components/Skeleton'
import { toast } from 'sonner'

interface KGNode {
  id: string
  name: string
  level?: 'beginner' | 'intermediate' | 'advanced' | null
  subject?: string | null
  language?: string | null
  summary?: string | null
  lesson_count: number
  source_lesson_id?: string | null
}

interface KGEdge {
  from: string
  to: string
  kind: string
  weight: number
  source_lesson_id?: string | null
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string
  name: string
  level?: string | null
  subject?: string | null
  summary?: string | null
  lesson_count: number
  source_lesson_id?: string | null
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  kind: string
  weight: number
}

const LEVEL_COLOR: Record<string, string> = {
  beginner: '#34d399',
  intermediate: '#60a5fa',
  advanced: '#a78bfa',
  default: '#94a3b8',
}

const KIND_COLOR: Record<string, string> = {
  prerequisite: '#f59e0b',
  contains: '#60a5fa',
  related_to: '#94a3b8',
  example_of: '#34d399',
  contrasts: '#f87171',
}

export default function KnowledgeGraphPage() {
  const { language } = useLanguage()
  const { getToken, isSignedIn, isLoaded } = useAuth()
  const lang: 'zh' | 'en' = language === 'zh' ? 'zh' : 'en'

  const [nodes, setNodes] = useState<KGNode[]>([])
  const [edges, setEdges] = useState<KGEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<KGNode | null>(null)
  const [filterLang, setFilterLang] = useState<'all' | 'zh' | 'en'>('all')

  const svgRef = useRef<SVGSVGElement | null>(null)

  const load = async () => {
    if (!isSignedIn) return
    setLoading(true)
    try {
      const token = await getToken()
      const url = filterLang === 'all'
        ? '/api/backend/users/me/knowledge-graph'
        : `/api/backend/users/me/knowledge-graph?language=${filterLang}`
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        toast.error(lang === 'zh' ? '加载知识图谱失败' : 'Failed to load knowledge graph')
        setNodes([])
        setEdges([])
        return
      }
      const data = await res.json()
      setNodes(Array.isArray(data?.nodes) ? data.nodes : [])
      setEdges(Array.isArray(data?.edges) ? data.edges : [])
    } catch (err) {
      console.error('[kg] load failed', err)
      setNodes([])
      setEdges([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isLoaded && isSignedIn) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, filterLang])

  // ── D3 force layout ─────────────────────────────────────────────────────────
  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return

    const width = svgEl.clientWidth || 800
    const height = svgEl.clientHeight || 520

    const svg = d3.select(svgEl)
    svg.selectAll('*').remove()

    if (nodes.length === 0) return

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }))
    const idSet = new Set(simNodes.map((n) => n.id))
    const simLinks: SimLink[] = edges
      .filter((e) => idSet.has(e.from) && idSet.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, kind: e.kind, weight: e.weight }))

    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(90).strength(0.5))
      .force('charge', d3.forceManyBody<SimNode>().strength(-220))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<SimNode>().radius((d) => 8 + Math.min(20, (d.lesson_count || 1) * 3)))

    // Zoom + pan
    const root = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (event) => root.attr('transform', event.transform))
    svg.call(zoom)

    // Arrowhead marker
    svg.append('defs').selectAll('marker')
      .data(Object.keys(KIND_COLOR))
      .enter()
      .append('marker')
      .attr('id', (d) => `arrow-${d}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 16)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', (d) => KIND_COLOR[d] || KIND_COLOR.related_to)

    const link = root.append('g')
      .attr('stroke-opacity', 0.55)
      .selectAll('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', (d) => KIND_COLOR[d.kind] || KIND_COLOR.related_to)
      .attr('stroke-width', (d) => 0.8 + Math.min(2.5, (d.weight || 0.5) * 2.5))
      .attr('marker-end', (d) => `url(#arrow-${d.kind in KIND_COLOR ? d.kind : 'related_to'})`)

    const node = root.append('g')
      .selectAll('g')
      .data(simNodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, SimNode>()
        .on('start', (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) sim.alphaTarget(0)
          d.fx = null
          d.fy = null
        }))
      .on('click', (_event, d) => {
        const original = nodes.find((n) => n.id === d.id) || null
        setSelected(original)
      })

    node.append('circle')
      .attr('r', (d) => 6 + Math.min(14, (d.lesson_count || 1) * 2))
      .attr('fill', (d) => LEVEL_COLOR[d.level || 'default'] || LEVEL_COLOR.default)
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 1.5)

    node.append('text')
      .text((d) => d.name)
      .attr('x', 12)
      .attr('y', 4)
      .attr('font-size', 11)
      .attr('font-family', 'IBM Plex Sans, system-ui, sans-serif')
      .attr('fill', '#1e293b')
      .attr('paint-order', 'stroke')
      .attr('stroke', 'rgba(255,255,255,0.9)')
      .attr('stroke-width', 3)

    sim.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0)
      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => {
      sim.stop()
    }
  }, [nodes, edges])

  const stats = useMemo(() => {
    const levels = nodes.reduce<Record<string, number>>((acc, n) => {
      const k = n.level || 'unknown'
      acc[k] = (acc[k] || 0) + 1
      return acc
    }, {})
    return { total: nodes.length, edges: edges.length, levels }
  }, [nodes, edges])

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow={lang === 'zh' ? '学习地图' : 'Knowledge map'}
        title={lang === 'zh' ? '你的知识图谱' : 'Your knowledge graph'}
        kicker={
          lang === 'zh'
            ? '每节课结束后，AI 自动从课程内容里抽出概念和关系，慢慢拼成属于你的学习地图。'
            : 'After every lesson the AI extracts concepts and relationships, building a personal map of what you have studied.'
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="text-xs text-slate-600">
          {lang === 'zh' ? `${stats.total} 个概念 · ${stats.edges} 条关系` : `${stats.total} concepts · ${stats.edges} relations`}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-slate-600">{lang === 'zh' ? '语言：' : 'Language:'}</label>
          <select
            value={filterLang}
            onChange={(e) => setFilterLang(e.target.value as any)}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="all">{lang === 'zh' ? '全部' : 'All'}</option>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs px-3 py-1 rounded-md border border-slate-300 hover:bg-slate-50"
          >
            {lang === 'zh' ? '刷新' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="card-new p-2 relative" style={{ minHeight: 540 }}>
          {loading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-[480px] w-full" rounded="lg" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[520px] text-center px-6">
              <div className="text-5xl mb-4" aria-hidden>🗺️</div>
              <h3 className="text-lg font-semibold text-slate-900 mb-1">
                {lang === 'zh' ? '地图还没绘出来' : 'Your map is empty'}
              </h3>
              <p className="text-sm text-slate-500 max-w-sm">
                {lang === 'zh'
                  ? '生成一节课后回到这里 — AI 会自动把课程里的概念加进图谱。'
                  : 'Finish a lesson and come back — AI will extract its concepts and start your map.'}
              </p>
              <a
                href="/study-plan"
                className="mt-4 inline-flex items-center gap-1 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
              >
                {lang === 'zh' ? '去学习计划 →' : 'Open study plan →'}
              </a>
            </div>
          ) : (
            <svg
              ref={svgRef}
              className="w-full"
              style={{ height: 540, background: 'radial-gradient(ellipse at center, #f8fafc 0%, #e2e8f0 100%)', borderRadius: 12 }}
              role="img"
              aria-label={lang === 'zh' ? '知识图谱可视化' : 'Knowledge graph visualization'}
            />
          )}

          {/* Legend */}
          {nodes.length > 0 && (
            <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur border border-slate-200 rounded-md px-3 py-2 text-[10px] text-slate-600 shadow-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: LEVEL_COLOR.beginner }} />
                  {lang === 'zh' ? '入门' : 'beginner'}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: LEVEL_COLOR.intermediate }} />
                  {lang === 'zh' ? '进阶' : 'intermediate'}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: LEVEL_COLOR.advanced }} />
                  {lang === 'zh' ? '高阶' : 'advanced'}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5" style={{ background: KIND_COLOR.prerequisite }} />
                  {lang === 'zh' ? '前置' : 'prerequisite'}
                </span>
              </div>
            </div>
          )}
        </div>

        <aside className="card-new p-4 h-fit lg:sticky lg:top-4">
          {selected ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">{selected.name}</h3>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-slate-400 hover:text-slate-700 text-sm"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {selected.level && (
                  <span
                    className="inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white font-semibold"
                    style={{ background: LEVEL_COLOR[selected.level] || LEVEL_COLOR.default }}
                  >
                    {selected.level}
                  </span>
                )}
                {selected.subject && (
                  <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {selected.subject}
                  </span>
                )}
                <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {selected.lesson_count}× {lang === 'zh' ? '课' : 'lessons'}
                </span>
              </div>
              {selected.summary && (
                <p className="mt-3 text-sm text-slate-700 leading-relaxed">{selected.summary}</p>
              )}
              {selected.source_lesson_id && (
                <a
                  href={`/lessons/${selected.source_lesson_id}`}
                  className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  {lang === 'zh' ? '查看相关课程 →' : 'View source lesson →'}
                </a>
              )}
              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="text-xs text-slate-500 mb-1">{lang === 'zh' ? '关联' : 'Connections'}</div>
                <ul className="space-y-1">
                  {edges
                    .filter((e) => e.from === selected.id || e.to === selected.id)
                    .slice(0, 12)
                    .map((e, i) => {
                      const otherId = e.from === selected.id ? e.to : e.from
                      const other = nodes.find((n) => n.id === otherId)
                      if (!other) return null
                      return (
                        <li key={i} className="text-xs text-slate-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: KIND_COLOR[e.kind] || KIND_COLOR.related_to }} />
                          <span className="text-slate-500">{e.kind}</span>
                          <span className="text-slate-700">→ {other.name}</span>
                        </li>
                      )
                    })}
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-500">
              {lang === 'zh'
                ? '点击图中任意节点查看详情、关联和来源课程。'
                : 'Click a node in the graph to see its details, connections, and source lessons.'}
              <div className="mt-3 text-xs text-slate-400">
                {lang === 'zh' ? '提示：拖拽节点重排，滚轮缩放。' : 'Tip: drag nodes to rearrange, scroll to zoom.'}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
