'use client'

import React, { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { BoardWSState, BoardElement, StyleAnimation, BoardBackground } from '../../hooks/useBoardWebSocket'
import { getRenderer } from './elements'

interface BoardCanvasProps {
  state: BoardWSState
  paused?: boolean
}

function backgroundClass(bg: BoardBackground | undefined): string {
  switch (bg) {
    case 'light_board':
      return 'board-bg-light'
    case 'grid':
      return 'board-bg-grid'
    case 'plain':
      return 'board-bg-plain'
    case 'dark_board':
    default:
      return 'board-bg-dark'
  }
}

function entryVariants(anim: StyleAnimation | undefined) {
  switch (anim) {
    case 'slide_in':
      return {
        initial: { opacity: 0, x: -24 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 24 },
      }
    case 'grow':
      return {
        initial: { opacity: 0, scale: 0.92 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.95 },
      }
    case 'write':
      return {
        initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
        animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
        exit: { opacity: 0 },
      }
    case 'none':
      return { initial: false as const, animate: {}, exit: {} }
    case 'fade_in':
    default:
      return {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0 },
      }
  }
}

export default function BoardCanvas({ state, paused = false }: BoardCanvasProps) {
  const background: BoardBackground = state.board?.background || 'dark_board'
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const userScrolledUpRef = useRef(false)
  const lastCountRef = useRef(0)

  const elements: BoardElement[] = state.elementOrder
    .map(id => state.elements[id])
    .filter((el): el is BoardElement => Boolean(el))

  // Detect manual scroll-up so we don't fight the user.
  const handleScroll = () => {
    const node = scrollRef.current
    if (!node) return
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    userScrolledUpRef.current = distanceFromBottom > 80
  }

  // Auto-scroll to newest element when not paused and user hasn't scrolled up.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const count = elements.length
    const grew = count > lastCountRef.current
    lastCountRef.current = count
    if (!grew) return
    if (paused) return
    if (userScrolledUpRef.current) return
    // Smooth scroll the newest item into view from the bottom.
    requestAnimationFrame(() => {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
    })
  }, [elements.length, paused])

  // Reset the "user scrolled up" flag whenever the lesson resumes, so we catch
  // up to the freshest content immediately.
  useEffect(() => {
    if (paused) return
    const node = scrollRef.current
    if (!node) return
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    if (distanceFromBottom < 120) userScrolledUpRef.current = false
  }, [paused])

  return (
    <div
      className={`relative w-full h-full rounded-xl overflow-hidden board-canvas ${backgroundClass(background)}`}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="w-full h-full overflow-y-auto overflow-x-hidden px-4 sm:px-8 py-6 board-scroll"
      >
        <div className="mx-auto w-full max-w-4xl flex flex-col gap-5 pb-24">
          {elements.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-24 text-slate-400 text-sm">
              Waiting for the board to come to life…
            </div>
          )}
          <AnimatePresence initial={false}>
            {elements.map((el, idx) => {
              const Renderer = getRenderer(el.element_type)
              const anim = entryVariants(el.style.animation)
              const highlighted = el.state === 'highlighted'
              const dim = el.state === 'dim'
              return (
                <motion.section
                  key={el.element_id}
                  data-element-index={idx}
                  data-element-type={el.element_type}
                  data-element-state={el.state || 'normal'}
                  initial={anim.initial as any}
                  animate={anim.animate as any}
                  exit={anim.exit as any}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className={[
                    'relative w-full rounded-xl border backdrop-blur-sm',
                    'bg-slate-900/40 border-slate-700/60',
                    'px-4 sm:px-6 py-4 sm:py-5',
                    'transition-shadow duration-300',
                    highlighted
                      ? 'ring-2 ring-amber-300/80 shadow-[0_0_28px_rgba(253,224,71,0.35)] border-amber-300/40'
                      : '',
                    dim ? 'opacity-45' : '',
                  ].join(' ')}
                >
                  <Renderer
                    element={el}
                    isHighlighted={highlighted}
                    isExiting={el.state === 'exiting'}
                  />
                </motion.section>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
      {paused && elements.length > 0 && (
        <div className="pointer-events-none absolute top-3 right-3 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-amber-300/60 bg-amber-500/15 text-amber-100">
          Paused — scroll to review
        </div>
      )}
    </div>
  )
}
