'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { BoardWSState, BoardElement, StyleAnimation, BoardBackground } from '../../hooks/useBoardWebSocket'
import { getRenderer } from './elements'

interface BoardCanvasProps {
  state: BoardWSState
  paused?: boolean
  activeElementId?: string | null
  /**
   * Learner-paced reveal cap: render only the first N elements (the unlocked
   * segments). `undefined` reveals everything — preserving the original
   * behaviour for callers that don't pace (board-replay, board-test).
   */
  revealedElementCount?: number
}

const INITIAL_MOBILE_VISIBLE_COUNT = 3

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

function entryVariants(anim: StyleAnimation | undefined, reduced: boolean = false) {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    }
  }
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

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(query.matches)
    update()
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update)
      return () => query.removeEventListener('change', update)
    }
    query.addListener(update)
    return () => query.removeListener(update)
  }, [])

  return isMobile
}

interface ElementSectionProps {
  element: BoardElement
  index: number
  reducedMotion: boolean
  isActiveNarration: boolean
}

/**
 * Memoised wrapper for a single element's section. Prevents the entire
 * element list from re-rendering whenever a non-related WS event mutates the
 * parent state. Wave 1F speed win: with 20+ elements on the board, the
 * unmemoised baseline re-rendered every renderer on every audio_ready event.
 */
const ElementSection = React.memo(function ElementSection({
  element: el,
  index: idx,
  reducedMotion,
  isActiveNarration,
}: ElementSectionProps) {
  const Renderer = getRenderer(el.element_type)
  const anim = entryVariants(el.style.animation, reducedMotion)
  const highlighted = el.state === 'highlighted'
  const dim = el.state === 'dim'
  return (
    <motion.section
      data-element-index={idx}
      data-element-id={el.element_id}
      data-element-type={el.element_type}
      data-element-state={el.state || 'normal'}
      initial={anim.initial as any}
      animate={anim.animate as any}
      exit={anim.exit as any}
      transition={{ duration: reducedMotion ? 0.15 : 0.35, ease: 'easeOut' }}
      className={[
        'relative w-full overflow-hidden rounded-xl border backdrop-blur-sm',
        'bg-slate-900/40 border-slate-700/60',
        'px-4 sm:px-6 py-4 sm:py-5',
        'min-w-0 max-w-full',
        'transition-shadow duration-300',
        highlighted
          ? 'ring-2 ring-amber-300/80 shadow-[0_0_28px_rgba(253,224,71,0.35)] border-amber-300/40'
          : '',
        isActiveNarration
          ? 'ring-2 ring-sky-300/80 shadow-[0_0_24px_rgba(56,189,248,0.30)] border-sky-300/50'
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
}, (prev, next) => {
  if (prev.reducedMotion !== next.reducedMotion) return false
  if (prev.index !== next.index) return false
  if (prev.isActiveNarration !== next.isActiveNarration) return false
  const a = prev.element
  const b = next.element
  if (a === b) return true
  if (a.element_id !== b.element_id) return false
  if (a.content !== b.content) return false
  if (a.state !== b.state) return false
  if (a.element_type !== b.element_type) return false
  if (a.narration !== b.narration) return false
  if (a.position !== b.position && JSON.stringify(a.position) !== JSON.stringify(b.position)) return false
  if (a.style !== b.style && JSON.stringify(a.style) !== JSON.stringify(b.style)) return false
  if (a.metadata !== b.metadata && JSON.stringify(a.metadata) !== JSON.stringify(b.metadata)) return false
  return true
})

export default function BoardCanvas({ state, paused = false, activeElementId = null, revealedElementCount }: BoardCanvasProps) {
  const background: BoardBackground = state.board?.background || 'dark_board'
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const userScrolledUpRef = useRef(false)
  const lastCountRef = useRef(0)
  const mobileViewportInitializedRef = useRef(false)
  const reducedMotion = useReducedMotion() ?? false
  const isMobileViewport = useIsMobileViewport()
  const [mobileVisibleCount, setMobileVisibleCount] = useState(0)
  const [mobilePacingActive, setMobilePacingActive] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)

  const elements: BoardElement[] = state.elementOrder
    .map(id => state.elements[id])
    .filter((el): el is BoardElement => Boolean(el))
  const lessonIsGenerating = state.status === 'streaming' || state.writingStatus === 'writing'
  const activeElementIndex = activeElementId
    ? elements.findIndex(el => el.element_id === activeElementId)
    : -1
  const minimumPacedCount = elements.length === 0
    ? 0
    : Math.min(elements.length, Math.max(activeElementIndex + 1, 1))

  useEffect(() => {
    if (!isMobileViewport) {
      mobileViewportInitializedRef.current = false
      setMobilePacingActive(false)
      setMobileVisibleCount(elements.length)
      return
    }
    if (elements.length === 0) {
      mobileViewportInitializedRef.current = false
      setMobilePacingActive(false)
      setMobileVisibleCount(0)
      return
    }
    if (!mobileViewportInitializedRef.current) {
      mobileViewportInitializedRef.current = true
      const initialVisibleCount = lessonIsGenerating
        ? Math.min(
          elements.length,
          Math.max(minimumPacedCount, Math.min(elements.length, INITIAL_MOBILE_VISIBLE_COUNT)),
        )
        : elements.length
      setMobileVisibleCount(initialVisibleCount)
      if (lessonIsGenerating) setMobilePacingActive(true)
      return
    }
    if (lessonIsGenerating) {
      setMobilePacingActive(true)
      setMobileVisibleCount(prev => {
        if (prev <= 0) {
          return Math.min(
            elements.length,
            Math.max(minimumPacedCount, Math.min(elements.length, INITIAL_MOBILE_VISIBLE_COUNT)),
          )
        }
        return Math.min(elements.length, Math.max(prev, minimumPacedCount))
      })
      return
    }
    if (!mobilePacingActive) {
      setMobileVisibleCount(elements.length)
    }
  }, [elements.length, isMobileViewport, lessonIsGenerating, minimumPacedCount, mobilePacingActive])

  useEffect(() => {
    if (!mobilePacingActive) return
    if (paused) {
      setMobilePacingActive(false)
      setMobileVisibleCount(elements.length)
      return
    }
    if (lessonIsGenerating) return
    if (mobileVisibleCount < elements.length) return
    setMobilePacingActive(false)
  }, [elements.length, lessonIsGenerating, mobilePacingActive, mobileVisibleCount, paused])

  useEffect(() => {
    if (!isMobileViewport || !mobilePacingActive || paused) return
    if (mobileVisibleCount >= elements.length) return
    const delay = activeElementId ? 1200 : 850
    const timer = window.setTimeout(() => {
      setMobileVisibleCount(prev => Math.min(prev + 1, elements.length))
    }, delay)
    return () => window.clearTimeout(timer)
  }, [activeElementId, elements.length, isMobileViewport, mobilePacingActive, mobileVisibleCount, paused])

  // Learner-paced segment cap (when provided) is the hard ceiling; the legacy
  // mobile element-pacing still applies underneath it for callers that don't pace
  // and as a finer reveal within the unlocked segments on small screens.
  const segmentCap = revealedElementCount ?? elements.length
  const pacedCount = isMobileViewport && mobilePacingActive
    ? Math.min(elements.length, Math.max(mobileVisibleCount, minimumPacedCount))
    : elements.length
  const renderedElementCount = Math.min(segmentCap, pacedCount)
  const renderedElements = elements.slice(0, renderedElementCount)

  // Detect manual scroll-up so we don't fight the user.
  const handleScroll = () => {
    const node = scrollRef.current
    if (!node) return
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    userScrolledUpRef.current = distanceFromBottom > 80
    setShowBackToTop(node.scrollTop > 80)
  }

  const handleBackToTop = () => {
    const node = scrollRef.current
    if (!node) return
    userScrolledUpRef.current = true
    node.scrollTo({ top: 0, behavior: 'smooth' })
    setShowBackToTop(false)
  }

  // Auto-scroll to newest element only before narration starts. During playback
  // the active narration controls viewport focus so generated widgets do not run
  // ahead of the spoken teaching.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const count = renderedElementCount
    const grew = count > lastCountRef.current
    lastCountRef.current = count
    if (!grew) return
    if (paused) return
    if (activeElementId) return
    if (userScrolledUpRef.current) return
    // Smooth scroll the newest item into view from the bottom.
    requestAnimationFrame(() => {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
    })
  }, [activeElementId, paused, renderedElementCount])

  useEffect(() => {
    if (!activeElementId || paused) return
    const node = scrollRef.current
    if (!node) return
    const target = node.querySelector<HTMLElement>(`[data-element-id="${activeElementId}"]`)
    if (!target) return
    userScrolledUpRef.current = false
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [activeElementId, paused])

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
        className="w-full h-full overflow-y-auto overflow-x-hidden px-3 py-5 sm:px-8 sm:py-6 board-scroll"
      >
        <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4 pb-24 sm:gap-5 sm:pb-24">
          {elements.length === 0 && (
            <div className="flex-1 flex items-center justify-center py-24 text-slate-400 text-sm">
              Waiting for the board to come to life…
            </div>
          )}
          <AnimatePresence initial={false}>
            {renderedElements.map((el, idx) => (
              <ElementSection
                key={el.element_id}
                element={el}
                index={idx}
                reducedMotion={reducedMotion}
                isActiveNarration={el.element_id === activeElementId}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
      {paused && elements.length > 0 && (
        <div className="pointer-events-none absolute top-3 right-3 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-amber-300/60 bg-amber-500/15 text-amber-100">
          Paused — scroll to review
        </div>
      )}
      {showBackToTop && (
        <button
          type="button"
          onClick={handleBackToTop}
          className="absolute right-3 bottom-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-500/70 bg-slate-950/85 text-slate-100 shadow-lg backdrop-blur hover:bg-slate-900 sm:hidden"
          aria-label="Back to top"
          title="Back to top"
        >
          <ChevronUp size={18} aria-hidden />
        </button>
      )}
    </div>
  )
}
