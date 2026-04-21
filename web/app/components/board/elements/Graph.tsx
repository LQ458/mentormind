'use client'

import React, { useMemo, useRef, useEffect } from 'react'
import * as d3 from 'd3'
import { compile, type EvalFunction } from 'mathjs'
import type { ElementProps } from './types'

function normalizeExpression(raw: string): string {
  let s = (raw || '').trim()
  if (!s) return ''
  // If the LLM wrote "y = x^2" or "L(x) = 2 + (1/4)(x-4)", keep only the RHS.
  if (s.includes('=')) {
    const parts = s.split('=')
    s = parts[parts.length - 1].trim()
  }
  // Convert "x²" / "x³" to "x^2" / "x^3" etc.
  const superscripts: Record<string, string> = {
    '²': '^2', '³': '^3', '⁴': '^4', '⁵': '^5', '⁶': '^6',
    '⁷': '^7', '⁸': '^8', '⁹': '^9', '⁰': '^0', '¹': '^1',
  }
  s = s.replace(/[²³⁴⁵⁶⁷⁸⁹⁰¹]/g, ch => superscripts[ch] || '')
  // Python-style power → caret for mathjs compatibility.
  s = s.replace(/\*\*/g, '^')
  return s
}

function safeCompile(expr: string): ((x: number) => number) | null {
  const normalized = normalizeExpression(expr)
  if (!normalized) return null
  // Allowlist keeps hostile input from reaching the parser.
  if (!/^[\sA-Za-z0-9_+\-*/^().,π]+$/.test(normalized)) return null
  let node: EvalFunction
  try {
    node = compile(normalized)
  } catch {
    return null
  }
  return (x: number) => {
    try {
      const v = node.evaluate({ x, pi: Math.PI, e: Math.E })
      return typeof v === 'number' ? v : Number.NaN
    } catch {
      return Number.NaN
    }
  }
}

export default function Graph({ element }: ElementProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const md = element.metadata || {}
  const xRange = (md.graph_x_range as [number, number] | undefined) || [-5, 5]
  const yRange = (md.graph_y_range as [number, number] | undefined) || [-5, 5]
  const expr = (md.graph_expression as string | undefined) || ''

  const points = useMemo(() => {
    const fn = safeCompile(expr)
    if (!fn) return []
    const out: Array<[number, number]> = []
    const steps = 200
    const dx = (xRange[1] - xRange[0]) / steps
    for (let i = 0; i <= steps; i++) {
      const x = xRange[0] + i * dx
      const y = fn(x)
      if (Number.isFinite(y)) out.push([x, y])
    }
    return out
  }, [expr, xRange])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const width = 360
    const height = 240
    const margin = { top: 10, right: 14, bottom: 24, left: 30 }
    const inner = svg
    inner.innerHTML = ''

    const x = d3.scaleLinear().domain(xRange).range([margin.left, width - margin.right])
    const y = d3.scaleLinear().domain(yRange).range([height - margin.bottom, margin.top])

    const sel = d3.select(svg)
    sel.attr('viewBox', `0 0 ${width} ${height}`)

    // axes
    sel.append('g')
      .attr('transform', `translate(0,${y(0)})`)
      .attr('color', '#94a3b8')
      .call(d3.axisBottom(x).ticks(6))
    sel.append('g')
      .attr('transform', `translate(${x(0)},0)`)
      .attr('color', '#94a3b8')
      .call(d3.axisLeft(y).ticks(6))

    if (points.length > 1) {
      const line = d3.line<[number, number]>()
        .x(p => x(p[0]))
        .y(p => y(p[1]))
        .defined(p => Number.isFinite(p[1]) && p[1] >= yRange[0] && p[1] <= yRange[1])
      sel.append('path')
        .datum(points)
        .attr('fill', 'none')
        .attr('stroke', '#38bdf8')
        .attr('stroke-width', 2)
        .attr('d', line as unknown as string)
    }
  }, [points, xRange, yRange])

  const plotted = points.length > 1
  return (
    <div className="rounded-lg bg-slate-900/40 p-2 border border-slate-700">
      <svg ref={svgRef} className="w-full h-auto" />
      {!plotted && (
        <p className="text-xs text-amber-300/80 mt-1 font-mono">
          {expr ? `Could not plot: ${expr}` : 'No graph expression provided'}
        </p>
      )}
      {element.content && (
        <p className="text-xs text-slate-300 mt-1 font-mono">{element.content}</p>
      )}
    </div>
  )
}
