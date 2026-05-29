'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { EyeOff, GripHorizontal, Settings, X } from 'lucide-react'
import { useTweaks, type Palette, type Accent, type Density } from './TweaksProvider'

const POS_KEY = 'mm:tweaks-position'
const HIDDEN_KEY = 'mm:tweaks-hidden'

type Point = { x: number; y: number }

function defaultPosition(): Point {
  if (typeof window === 'undefined') return { x: 20, y: 20 }
  return {
    x: Math.max(12, window.innerWidth - 170),
    y: Math.max(12, window.innerHeight - 72),
  }
}

function clampPosition(point: Point, panelOpen: boolean): Point {
  if (typeof window === 'undefined') return point
  const width = panelOpen ? 280 : 132
  const height = panelOpen ? 245 : 52
  return {
    x: Math.min(Math.max(12, point.x), Math.max(12, window.innerWidth - width - 12)),
    y: Math.min(Math.max(12, point.y), Math.max(12, window.innerHeight - height - 12)),
  }
}

export default function TweaksPanel() {
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [position, setPosition] = useState<Point | null>(null)
  const { tweaks, setPalette, setAccent, setDensity } = useTweaks()
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY)
      const isHidden = localStorage.getItem(HIDDEN_KEY) === '1'
      if (raw) {
        const parsed = JSON.parse(raw)
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          setPosition(clampPosition(parsed, open))
          setHidden(isHidden)
          return
        }
      }
      setPosition(clampPosition(defaultPosition(), open))
      setHidden(isHidden)
    } catch {
      setPosition(clampPosition(defaultPosition(), open))
    }
  }, [])

  useEffect(() => {
    const onResize = () => setPosition((prev) => (prev ? clampPosition(prev, open) : prev))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  useEffect(() => {
    try {
      if (!position) return
      localStorage.setItem(POS_KEY, JSON.stringify(position))
    } catch {
      // ignore
    }
  }, [position])

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0')
    } catch {
      // ignore
    }
  }, [hidden])

  const beginDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    if (!position) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
    setPosition(clampPosition({ x: drag.originX + dx, y: drag.originY + dy }, open))
  }

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    suppressClickRef.current = drag.moved
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }

  if (!position) return null

  if (hidden) {
    return (
      <button
        type="button"
        className="tweaks-reveal"
        onClick={() => setHidden(false)}
        title="Show Tweaks"
        aria-label="Show Tweaks"
      >
        T
      </button>
    )
  }

  const floatingStyle = {
    left: position.x,
    top: position.y,
  }

  if (!open) {
    return (
      <div className="tweaks-float" style={floatingStyle}>
        <button
          type="button"
          className="tweaks-pill"
          onPointerDown={beginDrag}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={() => {
            if (!suppressClickRef.current) setOpen(true)
          }}
          title="Customize look"
          aria-label="Open Tweaks"
        >
          <Settings size={14} />
          Tweaks
        </button>
        <button
          type="button"
          className="tweaks-mini"
          onClick={(event) => {
            event.stopPropagation()
            setHidden(true)
          }}
          title="Hide Tweaks"
          aria-label="Hide Tweaks"
        >
          <EyeOff size={13} />
        </button>
      </div>
    )
  }

  const palettes: { v: Palette; t: string }[] = [
    { v: 'cloud', t: 'Cloud' },
    { v: 'warm', t: 'Warm' },
    { v: 'graphite', t: 'Graph' },
    { v: 'midnight', t: 'Night' },
  ]

  const accents: { v: Accent; t: string }[] = [
    { v: 'blue', t: 'Blue' },
    { v: 'violet', t: 'Violet' },
    { v: 'green', t: 'Green' },
    { v: 'rose', t: 'Rose' },
  ]

  const densities: { v: Density; t: string }[] = [
    { v: 'comfortable', t: 'Comfy' },
    { v: 'spacious', t: 'Spacious' },
  ]

  return (
    <div className="tweaks" style={floatingStyle}>
      <h3>
        <span
          className="tweaks-title tweaks-drag"
          onPointerDown={beginDrag}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <GripHorizontal size={15} />
          Tweaks
        </span>
        <span className="tweaks-actions">
          <button
            type="button"
            className="close"
            onClick={() => setHidden(true)}
            aria-label="Hide tweaks button"
            title="Hide"
          >
            <EyeOff size={14} />
          </button>
          <button
            type="button"
            className="close"
            onClick={() => setOpen(false)}
            aria-label="Close tweaks panel"
            title="Close"
          >
            <X size={14} />
          </button>
        </span>
      </h3>
      <p className="desc">Live-edit the look. Saved to your browser.</p>

      <div className="tw-group">
        <div className="tw-label">Palette</div>
        <div className="tw-row">
          {palettes.map((o) => (
            <button
              key={o.v}
              className={`tw-btn ${tweaks.palette === o.v ? 'active' : ''}`}
              onClick={() => setPalette(o.v)}
            >
              {o.t}
            </button>
          ))}
        </div>
      </div>

      <div className="tw-group">
        <div className="tw-label">Accent</div>
        <div className="tw-row">
          {accents.map((o) => (
            <button
              key={o.v}
              className={`tw-btn ${tweaks.accent === o.v ? 'active' : ''}`}
              onClick={() => setAccent(o.v)}
            >
              {o.t}
            </button>
          ))}
        </div>
      </div>

      <div className="tw-group">
        <div className="tw-label">Density</div>
        <div className="tw-row">
          {densities.map((o) => (
            <button
              key={o.v}
              className={`tw-btn ${tweaks.density === o.v ? 'active' : ''}`}
              onClick={() => setDensity(o.v)}
            >
              {o.t}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
