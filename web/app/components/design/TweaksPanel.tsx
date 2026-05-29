'use client'

import { useState } from 'react'
import { Settings } from 'lucide-react'
import { useTweaks, type Palette, type Accent, type Density } from './TweaksProvider'

export default function TweaksPanel() {
  const [open, setOpen] = useState(false)
  const { tweaks, setPalette, setAccent, setDensity } = useTweaks()

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Customize look"
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          zIndex: 99,
          padding: '10px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 999,
          color: 'var(--ink)',
          fontFamily: 'var(--sans)',
          fontSize: 13,
          fontWeight: 500,
          boxShadow: 'var(--shadow)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
        }}
      >
        <Settings size={14} />
        Tweaks
      </button>
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
    <div className="tweaks">
      <h3>
        Tweaks
        <button
          type="button"
          className="close"
          onClick={() => setOpen(false)}
          aria-label="Close tweaks panel"
        >
          close
        </button>
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
