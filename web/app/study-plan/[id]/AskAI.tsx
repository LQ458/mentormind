'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'

interface AskAIProps {
  containerRef: React.RefObject<HTMLElement | null>
  subject?: string
  unitTitle?: string
  getAuthHeaders: () => Promise<Record<string, string>>
}

interface AIResponse {
  success: boolean
  answer: string
  error?: string
}

// ── Highlight Ask AI Popover ─────────────────────────────────────────────────

export function HighlightAskAI({ containerRef, subject, unitTitle, getAuthHeaders }: AskAIProps) {
  const [selectedText, setSelectedText] = useState('')
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null)
  const [showInput, setShowInput] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()
    if (!text || text.length < 3) {
      if (!showInput && !answer) {
        setSelectedText('')
        setPopoverPos(null)
      }
      return
    }

    const container = containerRef.current
    if (!container) return

    const range = selection?.getRangeAt(0)
    if (!range) return

    if (!container.contains(range.commonAncestorContainer)) return

    const rect = range.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    setSelectedText(text)
    setPopoverPos({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
    })
    setShowInput(false)
    setAnswer('')
    setError('')
  }, [containerRef, showInput, answer])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSelectedText('')
        setPopoverPos(null)
        setShowInput(false)
        setAnswer('')
        setError('')
        setQuestion('')
      }
    }
    if (popoverPos) {
      const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 200)
      return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClick) }
    }
  }, [popoverPos])

  const handleAsk = async () => {
    if (!question.trim()) return
    setLoading(true)
    setError('')
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/backend/study-plan/ask-ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          highlighted_text: selectedText,
          question: question.trim(),
          subject,
          unit_title: unitTitle,
        }),
      })
      const data: AIResponse = await res.json()
      if (data.success) {
        setAnswer(data.answer)
      } else {
        setError(data.error || 'Failed to get answer')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!popoverPos || !selectedText) return null

  return (
    <div
      ref={popoverRef}
      className="absolute z-50"
      style={{
        left: `${popoverPos.x}px`,
        top: `${popoverPos.y}px`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden" style={{ minWidth: showInput || answer ? '320px' : 'auto', maxWidth: '400px' }}>
        {!showInput && !answer ? (
          <button
            onClick={() => { setShowInput(true); setTimeout(() => inputRef.current?.focus(), 100) }}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Ask AI
          </button>
        ) : (
          <div className="p-3 space-y-2">
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 line-clamp-2">
              &ldquo;{selectedText.slice(0, 120)}{selectedText.length > 120 ? '...' : ''}&rdquo;
            </div>
            {!answer ? (
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAsk() }}
                  placeholder="Ask about this..."
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-800"
                  disabled={loading}
                />
                <button
                  onClick={handleAsk}
                  disabled={loading || !question.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  {loading ? '...' : 'Ask'}
                </button>
              </div>
            ) : (
              <div className="text-sm text-gray-800 leading-relaxed bg-blue-50 rounded-lg px-3 py-2">
                {answer}
              </div>
            )}
            {error && <p className="text-xs text-red-500">{error}</p>}
            {answer && (
              <button
                onClick={() => { setAnswer(''); setQuestion(''); setShowInput(true); setTimeout(() => inputRef.current?.focus(), 100) }}
                className="text-xs text-blue-600 hover:underline"
              >
                Ask another question
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-center">
        <div className="w-3 h-3 bg-white border-r border-b border-gray-200 transform rotate-45 -mt-1.5" />
      </div>
    </div>
  )
}

// ── Screenshot Ask AI ────────────────────────────────────────────────────────

export function ScreenshotAskAI({ containerRef, subject, unitTitle, getAuthHeaders }: AskAIProps) {
  const [capturing, setCapturing] = useState(false)
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null)
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const overlayRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClose = useCallback(() => {
    setCapturedImage(null)
    setAnswer('')
    setError('')
    setQuestion('')
  }, [])

  const startCapture = () => {
    setCapturing(true)
    setCropStart(null)
    setCropEnd(null)
    setCapturedImage(null)
    setAnswer('')
    setError('')
    setQuestion('')
  }

  // ESC to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCapturing(false)
        setCropStart(null)
        setCropEnd(null)
        if (capturedImage) handleClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [capturedImage, handleClose])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!capturing) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    setCropStart({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setCropEnd(null)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!capturing || !cropStart) return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    setCropEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const handleMouseUp = async () => {
    if (!capturing || !cropStart || !cropEnd) return
    const container = containerRef.current
    if (!container) return

    const x = Math.min(cropStart.x, cropEnd.x)
    const y = Math.min(cropStart.y, cropEnd.y)
    const w = Math.abs(cropEnd.x - cropStart.x)
    const h = Math.abs(cropEnd.y - cropStart.y)

    if (w < 20 || h < 20) {
      setCapturing(false)
      setCropStart(null)
      setCropEnd(null)
      return
    }

    try {
      const canvas = await html2canvas(container, {
        x: x,
        y: y + container.scrollTop,
        width: w,
        height: h,
        scale: 2,
        useCORS: true,
        logging: false,
      })
      const dataUrl = canvas.toDataURL('image/png')
      setCapturedImage(dataUrl)
      setCapturing(false)
      setCropStart(null)
      setCropEnd(null)
      setTimeout(() => inputRef.current?.focus(), 200)
    } catch (err) {
      console.error('Screenshot capture failed:', err)
      setCapturing(false)
      setCropStart(null)
      setCropEnd(null)
    }
  }

  const handleAsk = async () => {
    if (!capturedImage) return
    setLoading(true)
    setError('')
    try {
      const headers = await getAuthHeaders()
      const base64 = capturedImage.split(',')[1]
      const res = await fetch('/api/backend/study-plan/ask-ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          image_base64: base64,
          question: question.trim() || 'Explain what is shown in this image.',
          subject,
          unit_title: unitTitle,
        }),
      })
      const data: AIResponse = await res.json()
      if (data.success) {
        setAnswer(data.answer)
      } else {
        setError(data.error || 'Failed to get answer')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const cropRect = cropStart && cropEnd ? {
    left: Math.min(cropStart.x, cropEnd.x),
    top: Math.min(cropStart.y, cropEnd.y),
    width: Math.abs(cropEnd.x - cropStart.x),
    height: Math.abs(cropEnd.y - cropStart.y),
  } : null

  return (
    <>
      <button
        onClick={startCapture}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        title="Select area and ask AI"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Screenshot Ask AI
      </button>

      {capturing && (
        <div
          ref={overlayRef}
          className="absolute inset-0 z-40 cursor-crosshair"
          style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full">
            Drag to select an area &mdash; ESC to cancel
          </div>
          {cropRect && (
            <div
              className="absolute border-2 border-blue-500 bg-blue-500/10"
              style={{
                left: `${cropRect.left}px`,
                top: `${cropRect.top}px`,
                width: `${cropRect.width}px`,
                height: `${cropRect.height}px`,
              }}
            />
          )}
        </div>
      )}

      {capturedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-lg w-full mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Ask AI about this screenshot</h3>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="rounded-lg border border-gray-200 overflow-hidden max-h-48">
                <img src={capturedImage} alt="Captured region" className="w-full object-contain" />
              </div>
              {!answer ? (
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAsk() }}
                    placeholder="Ask about this image... (or press Ask for explanation)"
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-800"
                    disabled={loading}
                  />
                  <button
                    onClick={handleAsk}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0"
                  >
                    {loading ? 'Thinking...' : 'Ask'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm text-gray-800 leading-relaxed bg-blue-50 rounded-lg px-4 py-3">
                    {answer}
                  </div>
                  <button
                    onClick={() => { setAnswer(''); setQuestion(''); setTimeout(() => inputRef.current?.focus(), 100) }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Ask another question
                  </button>
                </div>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
