'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { HighlightAskAI, ScreenshotAskAI } from './AskAI'
import MediaContextTab from './MediaContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GaokaoSessionData {
  id: string
  subject: string
  topic_focus: string | null
  status: string
  created_at: string | null
}

interface PlanData {
  id: string
  title: string
  subject: string
  framework: string
  progress_percentage: number
  status: string
  units: UnitData[]
  gaokao_sessions?: GaokaoSessionData[]
}

interface UnitData {
  id: string
  title: string
  order_index: number
  topics: string[]
  content_status: string // pending | generating | ready | failed
  is_completed: boolean
  estimated_minutes: number
}

type ContentTab = 'study_guide' | 'quiz' | 'flashcards' | 'formulas' | 'mock_exam' | 'my_context'

const SUBJECT_LABELS: Record<string, string> = {
  math: 'Mathematics', physics: 'Physics', chemistry: 'Chemistry',
  biology: 'Biology', cs: 'Computer Science', history: 'History',
  english: 'English', economics: 'Economics', psychology: 'Psychology',
  government: 'Government & Politics', world_languages: 'World Languages',
  environmental_science: 'Environmental Science', art: 'Art', general: 'General',
}

const FRAMEWORK_LABELS: Record<string, string> = {
  ap: 'AP', a_level: 'A Level', ib: 'IB', gaokao: 'Gaokao', general: 'General',
}

interface EducationalImage {
  url: string
  title: string
  attribution: string
  source: string
}

interface StudyGuideSection {
  title: string
  content: string
  examples?: string[]
  common_mistakes?: string[]
}

interface StudyGuide {
  sections: StudyGuideSection[]
  educational_images?: EducationalImage[]
}

interface QuizQuestion {
  id: string
  type: 'mcq' | 'short_answer'
  question: string
  choices?: string[]
  correct_answer: string
  explanation?: string
}

interface Quiz {
  questions: QuizQuestion[]
}

interface Flashcard {
  front: string
  back: string
}

interface Formula {
  name: string
  formula: string
  variables?: string
  usage?: string
  category?: string
}

interface MockExamQuestion {
  id: number
  type: 'mcq' | 'short_answer' | 'free_response'
  question: string
  choices?: string[]
  correct_answer: string
  explanation?: string
  points: number
  topic?: string
}

interface MockExamSection {
  name: string
  time_minutes: number
  weight_percentage: number
  questions: MockExamQuestion[]
}

interface MockExam {
  title: string
  time_limit_minutes: number
  sections: MockExamSection[]
  total_points: number
  score_conversion?: {
    description: string
    ranges: { min: number; max: number; grade: string }[]
  }
}

interface UnitContent {
  study_guide?: StudyGuide
  quiz?: Quiz
  flashcards?: Flashcard[]
  formulas?: Formula[]
  mock_exam?: MockExam
  mock_exam_mapped?: MockExam
}

// ── Inline renderers ──────────────────────────────────────────────────────────

// Render a LaTeX string to HTML via KaTeX, returning raw HTML or the original string on error
function renderLatex(latex: string, displayMode = false): string {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode })
  } catch {
    return latex
  }
}

// Known LaTeX command names (no backslash)
const LATEX_CMDS = new Set([
  'frac','sqrt','sin','cos','tan','cot','sec','csc','log','ln','lim','sum','prod','int',
  'infty','pi','theta','alpha','beta','gamma','delta','epsilon','lambda','mu','sigma',
  'omega','phi','psi','rho','tau','pm','mp','times','cdot','leq','geq','neq','approx',
  'equiv','subset','supset','cup','cap','in','notin','forall','exists','nabla','partial',
  'left','right','text','overline','underline','hat','bar','vec','dot','ddot','mathbb',
  'mathbf','mathrm','mathcal','operatorname',
])

// Read a brace-delimited group {…} handling nesting. Returns the content including braces,
// or empty string if s[pos] is not '{'.
function readBraceGroup(s: string, pos: number): string {
  if (pos >= s.length || s[pos] !== '{') return ''
  let depth = 1
  let i = pos + 1
  while (i < s.length && depth > 0) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') depth--
    i++
  }
  return depth === 0 ? s.slice(pos, i) : ''
}

// Parse a single LaTeX token starting at pos (must start with '\\').
// Returns the full token string or '' if not a recognized command.
function readLatexToken(s: string, pos: number): string {
  if (pos >= s.length || s[pos] !== '\\') return ''
  // Read command name
  let i = pos + 1
  while (i < s.length && /[a-zA-Z]/.test(s[i])) i++
  if (i === pos + 1) return '' // lone backslash or \symbol
  const cmd = s.slice(pos + 1, i)
  if (!LATEX_CMDS.has(cmd)) return ''
  let token = s.slice(pos, i)
  // Consume brace-group arguments (e.g. \frac{a}{b}, \sqrt{x}, \text{hello})
  while (i < s.length && s[i] === '{') {
    const grp = readBraceGroup(s, i)
    if (!grp) break
    token += grp
    i += grp.length
  }
  return token
}

// Check if character at pos is a LaTeX token start or opening paren before one
function isLatexAhead(s: string, pos: number): boolean {
  if (pos >= s.length) return false
  if (s[pos] === '\\') return readLatexToken(s, pos) !== ''
  return false
}

// Wrap bare LaTeX in $...$ so the main renderer can pick it up.
// Handles: \cmd, \cmd{arg}, \frac{a}{b}, and runs like \sin\theta = \frac{...}{...}
function wrapBareLatex(text: string): string {
  if (!/\\[a-zA-Z]/.test(text)) return text // fast exit: no backslash commands

  // Split on existing $..$ / $$...$$ segments to avoid double-wrapping
  const segments = text.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/)
  return segments.map(seg => {
    // Already delimited — keep as-is
    if ((seg.startsWith('$$') || seg.startsWith('$')) && seg.endsWith('$')) return seg

    let result = ''
    let i = 0
    while (i < seg.length) {
      // Check for opening paren(s) immediately before a LaTeX command
      if (seg[i] === '(' && i + 1 < seg.length && isLatexAhead(seg, i + 1)) {
        // Absorb the opening paren into the run prefix
        let prefix = '('
        let start = i + 1
        const tok = readLatexToken(seg, start)
        if (tok) {
          let run = prefix + tok
          let j = start + tok.length
          let openParens = 1 // track paren balance
          run = consumeLatexRun(seg, j, run, openParens).run
          j = consumeLatexRun(seg, j, prefix + tok, openParens).j
          result += `$${run}$`
          i = j
          continue
        }
      }

      if (seg[i] === '\\') {
        const tok = readLatexToken(seg, i)
        if (tok) {
          let run = tok
          let j = i + tok.length
          const consumed = consumeLatexRun(seg, j, run, 0)
          run = consumed.run
          j = consumed.j
          result += `$${run}$`
          i = j
        } else {
          result += seg[i]
          i++
        }
      } else {
        result += seg[i]
        i++
      }
    }
    return result
  }).join('')
}

// Continue consuming a LaTeX run: absorb adjacent LaTeX tokens, sub/superscripts,
// connective operators, and balanced parentheses.
function consumeLatexRun(seg: string, startJ: number, startRun: string, openParens: number): { run: string; j: number } {
  let run = startRun
  let j = startJ

  while (j < seg.length) {
    let k = j
    // Skip whitespace
    while (k < seg.length && (seg[k] === ' ' || seg[k] === '\t')) k++

    // Sub/superscript
    if (k < seg.length && (seg[k] === '_' || seg[k] === '^')) {
      run += seg.slice(j, k + 1)
      k++
      if (k < seg.length && seg[k] === '{') {
        const grp = readBraceGroup(seg, k)
        if (grp) { run += grp; k += grp.length }
      } else if (k < seg.length) {
        run += seg[k]; k++
      }
      j = k
      continue
    }

    // Opening paren — absorb if followed by LaTeX
    if (k < seg.length && seg[k] === '(' && k + 1 < seg.length && isLatexAhead(seg, k + 1)) {
      run += seg.slice(j, k + 1)
      openParens++
      j = k + 1
      continue
    }

    // Closing paren — absorb if we have unmatched opens
    if (k < seg.length && seg[k] === ')' && openParens > 0) {
      run += seg.slice(j, k + 1)
      openParens--
      j = k + 1
      // After closing paren, check if there's more LaTeX (e.g., ), \cos(...))
      continue
    }

    // Another LaTeX command
    if (k < seg.length && seg[k] === '\\') {
      const next = readLatexToken(seg, k)
      if (next) {
        run += seg.slice(j, k) + next
        j = k + next.length
        continue
      }
    }

    // Connective glue: operators, digits, commas — only absorb if followed by more LaTeX
    if (k < seg.length && /^[=+\-*/,[\]<>0-9. ]+/.test(seg.slice(k))) {
      const glueMatch = seg.slice(k).match(/^[=+\-*/,[\]<>0-9. ]+/)
      if (glueMatch) {
        const afterGlue = k + glueMatch[0].length
        // Check if more LaTeX follows, or if there's a paren-then-LaTeX
        if (afterGlue < seg.length && (isLatexAhead(seg, afterGlue) ||
            (seg[afterGlue] === '(' && afterGlue + 1 < seg.length && isLatexAhead(seg, afterGlue + 1)))) {
          run += seg.slice(j, afterGlue)
          j = afterGlue
          continue
        }
      }
    }
    break
  }

  // Absorb any trailing closing parens that match opens we absorbed
  while (openParens > 0 && j < seg.length && seg[j] === ')') {
    run += ')'
    openParens--
    j++
  }

  return { run, j }
}

function renderInlineText(text: string): React.ReactNode {
  const safeText = typeof text === 'string' ? text : String(text ?? '')

  // Pre-process: wrap bare LaTeX commands in $...$
  const processed = wrapBareLatex(safeText)

  const parts: React.ReactNode[] = []
  // Match $math$, $$display math$$, or **bold**
  const re = /\$\$([^$]+)\$\$|\$([^$]+)\$|\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(processed)) !== null) {
    if (m.index > last) {
      parts.push(<span key={i++}>{processed.slice(last, m.index)}</span>)
    }
    if (m[1] !== undefined) {
      // $$display math$$
      parts.push(
        <span key={i++} className="block my-2" dangerouslySetInnerHTML={{ __html: renderLatex(m[1], true) }} />
      )
    } else if (m[2] !== undefined) {
      // $inline math$
      parts.push(
        <span key={i++} className="inline-math" dangerouslySetInnerHTML={{ __html: renderLatex(m[2]) }} />
      )
    } else if (m[3] !== undefined) {
      // **bold**
      parts.push(<strong key={i++} className="font-semibold text-gray-900">{m[3]}</strong>)
    }
    last = m.index + m[0].length
  }
  if (last < processed.length) parts.push(<span key={i++}>{processed.slice(last)}</span>)
  return parts
}

function ChartImage({ title, src }: { title: string; src: string }) {
  if (!src.startsWith('data:image/')) return null
  return (
    <div className="my-4 rounded-lg border border-gray-200 overflow-hidden bg-white">
      <img src={src} alt={title} className="w-full max-w-2xl mx-auto" loading="lazy" />
      {title && (
        <p className="text-xs text-gray-500 text-center py-2 bg-gray-50 border-t border-gray-100">
          {title}
        </p>
      )}
    </div>
  )
}

function TextBlock({ text }: { text: string }) {
  const str = typeof text === 'string' ? text : String(text ?? '')

  // Split on chart image markers: [CHART_IMAGE:title:data:image/png;base64,...]
  const chartPattern = /\[CHART_IMAGE:([^:]*):([^\]]+)\]/g
  const parts: React.ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  let idx = 0

  while ((match = chartPattern.exec(str)) !== null) {
    if (match.index > last) {
      const textBefore = str.slice(last, match.index)
      parts.push(
        <span key={idx++}>
          {textBefore.split('\n').map((line, li) => (
            <span key={li}>
              {li > 0 && <br />}
              {renderInlineText(line)}
            </span>
          ))}
        </span>
      )
    }
    parts.push(<ChartImage key={idx++} title={match[1]} src={match[2]} />)
    last = match.index + match[0].length
  }

  if (last < str.length) {
    const remaining = str.slice(last)
    parts.push(
      <span key={idx++}>
        {remaining.split('\n').map((line, li) => (
          <span key={li}>
            {li > 0 && <br />}
            {renderInlineText(line)}
          </span>
        ))}
      </span>
    )
  }

  if (parts.length === 0) {
    return (
      <span>
        {str.split('\n').map((line, li) => (
          <span key={li}>
            {li > 0 && <br />}
            {renderInlineText(line)}
          </span>
        ))}
      </span>
    )
  }

  return <>{parts}</>
}

// ── Study Guide Tab ───────────────────────────────────────────────────────────

function EducationalImagesBlock({ images }: { images: EducationalImage[] }) {
  if (!images?.length) return null
  return (
    <div className="mt-6 border-t border-gray-200 pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Related Images</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {images.map((img, i) => (
          <div key={i} className="rounded-lg border border-gray-200 overflow-hidden bg-white">
            <img
              src={img.url}
              alt={img.title}
              className="w-full h-40 object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div className="p-2">
              <p className="text-xs font-medium text-gray-700 truncate">{img.title}</p>
              <p className="text-[10px] text-gray-400 truncate">{img.attribution} · {img.source}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StudyGuideTab({ guide }: { guide: StudyGuide }) {
  if (!guide?.sections?.length) {
    return <p className="text-gray-500 italic">No study guide content available.</p>
  }
  return (
    <div className="space-y-6">
      {guide.sections.map((section, si) => (
        <div key={si} className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-3">{section.title}</h3>
          <div className="text-sm text-gray-700 leading-relaxed">
            <TextBlock text={section.content} />
          </div>
          {section.examples && section.examples.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Examples</h4>
              <div className="space-y-3">
                {section.examples.map((ex, ei) => {
                  if (typeof ex === 'object' && ex !== null) {
                    const { problem, solution, explanation } = ex as { problem?: string; solution?: string; explanation?: string }
                    return (
                      <div key={ei} className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 space-y-2">
                        {problem && (
                          <div>
                            <span className="text-xs font-semibold text-blue-600 uppercase">Problem</span>
                            <p className="text-sm text-gray-800 mt-0.5"><TextBlock text={problem} /></p>
                          </div>
                        )}
                        {solution && (
                          <div>
                            <span className="text-xs font-semibold text-green-600 uppercase">Solution</span>
                            <p className="text-sm text-gray-700 mt-0.5"><TextBlock text={solution} /></p>
                          </div>
                        )}
                        {explanation && (
                          <div>
                            <span className="text-xs font-semibold text-gray-500 uppercase">Explanation</span>
                            <p className="text-sm text-gray-600 mt-0.5 italic"><TextBlock text={explanation} /></p>
                          </div>
                        )}
                      </div>
                    )
                  }
                  return (
                    <div key={ei} className="text-sm text-gray-700 flex gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <TextBlock text={String(ex)} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {section.common_mistakes && section.common_mistakes.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-red-500 mb-2">Common Mistakes</h4>
              <ul className="space-y-1">
                {section.common_mistakes.map((m, mi) => (
                  <li key={mi} className="text-sm text-red-700 flex gap-2">
                    <span className="mt-0.5">⚠</span>
                    <TextBlock text={m} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
      <EducationalImagesBlock images={guide.educational_images ?? []} />
    </div>
  )
}

// ── Quiz Tab ──────────────────────────────────────────────────────────────────

function matchesAnswer(userChoice: string, correctAnswer: string): boolean {
  const u = userChoice.trim().toLowerCase()
  const c = correctAnswer.trim().toLowerCase()
  if (u === c) return true
  // Handle case where correct_answer is just the letter (e.g. "D") and choice is "D) ..."
  const letterMatch = c.match(/^([a-d])$/)
  if (letterMatch) {
    return u.startsWith(letterMatch[1] + ')')
  }
  // Handle case where correct_answer is "D) ..." and choice is just selected
  const choiceLetterMatch = u.match(/^([a-d])\)/)
  const ansLetterMatch = c.match(/^([a-d])\)/)
  if (choiceLetterMatch && ansLetterMatch) {
    return choiceLetterMatch[1] === ansLetterMatch[1]
  }
  return false
}

function QuizTab({ quiz }: { quiz: Quiz }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)

  const questions = quiz?.questions ?? []

  if (!questions.length) {
    return <p className="text-gray-500 italic">No quiz questions available.</p>
  }

  const score = submitted
    ? questions.filter(q => matchesAnswer(answers[q.id] ?? '', q.correct_answer)).length
    : 0

  const displayQuestions = showAll ? questions : [questions[currentIdx]]

  const handleSubmit = () => setSubmitted(true)
  const handleReset = () => {
    setAnswers({})
    setSubmitted(false)
    setCurrentIdx(0)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAll(v => !v)}
            className="text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {showAll ? 'One at a time' : 'Show all'}
          </button>
          {submitted && (
            <span className="text-sm font-medium text-gray-700">
              Score: <span className="text-green-600 font-semibold">{score}/{questions.length}</span>
            </span>
          )}
        </div>
        {submitted && (
          <button
            onClick={handleReset}
            className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Retry
          </button>
        )}
      </div>

      {displayQuestions.map((q) => {
        const userAnswer = answers[q.id] ?? ''
        const isCorrect = submitted && userAnswer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()
        const isWrong = submitted && !isCorrect

        return (
          <div
            key={q.id}
            className={`rounded-xl border p-5 transition-colors ${
              submitted
                ? isCorrect
                  ? 'border-green-300 bg-green-50'
                  : 'border-red-300 bg-red-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <p className="text-sm font-medium text-gray-900 mb-3">
              <TextBlock text={q.question} />
            </p>

            {q.type === 'mcq' && q.choices ? (
              <div className="space-y-2">
                {q.choices.map((choice, ci) => {
                  const isSelected = userAnswer === choice
                  const isCorrectChoice = submitted && matchesAnswer(choice, q.correct_answer)
                  return (
                    <label
                      key={ci}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                        submitted
                          ? isCorrectChoice
                            ? 'bg-green-100 text-green-800'
                            : isSelected
                              ? 'bg-red-100 text-red-800'
                              : 'text-gray-600'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={choice}
                        checked={isSelected}
                        disabled={submitted}
                        onChange={() => setAnswers(prev => ({ ...prev, [q.id]: choice }))}
                        className="accent-blue-600"
                      />
                      <span className="text-sm"><TextBlock text={choice} /></span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <textarea
                value={userAnswer}
                disabled={submitted}
                onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Type your answer..."
                rows={3}
                className="w-full text-sm rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60"
              />
            )}

            {submitted && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold text-gray-500">
                  {isCorrect ? '✓ Correct!' : `✗ Correct answer: ${q.correct_answer}`}
                </p>
                {q.explanation && (
                  <p className="text-xs text-gray-600 italic"><TextBlock text={q.explanation} /></p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {!showAll && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="text-sm px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors text-gray-700"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            {currentIdx + 1} / {questions.length}
          </span>
          <button
            onClick={() => setCurrentIdx(i => Math.min(questions.length - 1, i + 1))}
            disabled={currentIdx === questions.length - 1}
            className="text-sm px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors text-gray-700"
          >
            Next
          </button>
        </div>
      )}

      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={Object.keys(answers).length === 0}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium transition-colors"
        >
          Submit Answers
        </button>
      )}
    </div>
  )
}

// ── Flashcards Tab ────────────────────────────────────────────────────────────

function FlashcardsTab({ cards }: { cards: Flashcard[] }) {
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

  if (!cards?.length) {
    return <p className="text-gray-500 italic">No flashcards available.</p>
  }

  const card = cards[idx]

  const goTo = (next: number) => {
    setFlipped(false)
    setIdx(next)
  }

  return (
    <div className="space-y-5">
      <div className="text-center text-xs text-gray-500">
        Card {idx + 1} of {cards.length} — click card to flip
      </div>

      {/* Flip card */}
      <div
        className="relative cursor-pointer select-none"
        style={{ perspective: '1000px', height: '220px' }}
        onClick={() => setFlipped(v => !v)}
      >
        <div
          className="absolute inset-0 transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-blue-200 bg-white p-6 text-center shadow-sm"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <span className="text-xs uppercase tracking-wide text-blue-500 mb-3 font-semibold">Front</span>
            <p className="text-base font-medium text-gray-900 leading-relaxed">
              <TextBlock text={card.front} />
            </p>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-purple-200 bg-purple-50 p-6 text-center shadow-sm"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <span className="text-xs uppercase tracking-wide text-purple-500 mb-3 font-semibold">Back</span>
            <p className="text-base text-gray-900 leading-relaxed">
              <TextBlock text={card.back} />
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => goTo(Math.max(0, idx - 1))}
          disabled={idx === 0}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 disabled:opacity-40 hover:bg-gray-50 transition-colors"
        >
          Previous
        </button>
        <div className="flex gap-1">
          {cards.map((_, ci) => (
            <button
              key={ci}
              onClick={() => goTo(ci)}
              className={`w-2 h-2 rounded-full transition-colors ${ci === idx ? 'bg-blue-600' : 'bg-gray-300'}`}
            />
          ))}
        </div>
        <button
          onClick={() => goTo(Math.min(cards.length - 1, idx + 1))}
          disabled={idx === cards.length - 1}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 disabled:opacity-40 hover:bg-gray-50 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}

// ── Formulas Tab ──────────────────────────────────────────────────────────────

function FormulasTab({ formulas }: { formulas: Formula[] }) {
  if (!formulas?.length) {
    return <p className="text-gray-500 italic">No formulas available.</p>
  }

  const byCategory = formulas.reduce<Record<string, Formula[]>>((acc, f) => {
    const cat = f.category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(f)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(byCategory).map(([category, items]) => (
        <div key={category}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">{category}</h3>
          <div className="space-y-3">
            {items.map((f, fi) => (
              <div key={fi} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 mb-1">{f.name}</p>
                    <div className="font-mono text-sm bg-gray-50 rounded-lg px-3 py-2 text-blue-700 border border-gray-100 break-all">
                      <TextBlock text={f.formula} />
                    </div>
                  </div>
                </div>
                {(f.variables || f.usage) && (
                  <div className="mt-3 space-y-1">
                    {f.variables && (
                      <p className="text-xs text-gray-600">
                        <span className="font-medium">Variables:</span> {f.variables}
                      </p>
                    )}
                    {f.usage && (
                      <p className="text-xs text-gray-600">
                        <span className="font-medium">Usage:</span> {f.usage}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Mock Exam Tab ────────────────────────────────────────────────────────────

function MockExamTab({ exam }: { exam: MockExam }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState<{ earned: number; total: number } | null>(null)

  const handleAnswer = (qId: string, answer: string) => {
    if (submitted) return
    setAnswers(prev => ({ ...prev, [qId]: answer }))
  }

  const handleSubmit = () => {
    let earned = 0
    let total = 0
    for (const section of exam.sections) {
      for (const q of section.questions) {
        total += q.points
        const userAnswer = answers[`${q.id}`]
        if (userAnswer && userAnswer.toLowerCase().trim() === q.correct_answer.toLowerCase().trim()) {
          earned += q.points
        }
      }
    }
    setScore({ earned, total })
    setSubmitted(true)
  }

  const handleReset = () => {
    setAnswers({})
    setSubmitted(false)
    setScore(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{exam.title}</h2>
          <p className="text-sm text-gray-500">
            Time limit: {exam.time_limit_minutes} min · Total: {exam.total_points} points
          </p>
        </div>
        {submitted && score && (
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">{score.earned}/{score.total}</p>
            <p className="text-sm text-gray-500">{Math.round((score.earned / score.total) * 100)}%</p>
          </div>
        )}
      </div>

      {exam.sections.map((section, si) => (
        <div key={si} className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h3 className="font-medium text-gray-900">{section.name}</h3>
            <p className="text-xs text-gray-500">
              {section.time_minutes} min · {section.weight_percentage}% weight
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {section.questions.map((q) => {
              const qKey = `${q.id}`
              const isCorrect = submitted && answers[qKey]?.toLowerCase().trim() === q.correct_answer.toLowerCase().trim()
              const isWrong = submitted && answers[qKey] && !isCorrect

              return (
                <div key={q.id} className={`p-4 ${submitted ? (isCorrect ? 'bg-green-50' : isWrong ? 'bg-red-50' : 'bg-gray-50') : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-medium text-gray-400 mt-0.5">Q{q.id}</span>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900 mb-2">
                        <TextBlock text={q.question} />
                      </p>
                      {q.type === 'mcq' && q.choices ? (
                        <div className="space-y-1.5">
                          {q.choices.map((choice, ci) => {
                            const choiceLetter = choice.charAt(0)
                            const isSelected = answers[qKey] === choiceLetter
                            return (
                              <button
                                key={ci}
                                onClick={() => handleAnswer(qKey, choiceLetter)}
                                disabled={submitted}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                                  isSelected
                                    ? submitted
                                      ? isCorrect ? 'border-green-400 bg-green-100' : 'border-red-400 bg-red-100'
                                      : 'border-blue-400 bg-blue-50'
                                    : submitted && choiceLetter === q.correct_answer
                                      ? 'border-green-400 bg-green-50'
                                      : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <TextBlock text={choice} />
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={answers[qKey] || ''}
                          onChange={(e) => handleAnswer(qKey, e.target.value)}
                          disabled={submitted}
                          placeholder="Type your answer..."
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        />
                      )}
                      {submitted && q.explanation && (
                        <div className="mt-2 p-2 bg-blue-50 rounded-lg text-xs text-blue-800">
                          <span className="font-medium">Explanation:</span>{' '}
                          <TextBlock text={q.explanation} />
                        </div>
                      )}
                      <span className="text-xs text-gray-400 mt-1 inline-block">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="flex gap-3">
        {!submitted ? (
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Submit Exam
          </button>
        ) : (
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
          >
            Retake Exam
          </button>
        )}
      </div>

      {submitted && exam.score_conversion && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-2">Score Conversion</p>
          <p className="text-xs text-gray-500 mb-2">{exam.score_conversion.description}</p>
          <div className="flex flex-wrap gap-2">
            {exam.score_conversion.ranges.map((r, i) => (
              <span key={i} className="text-xs px-2 py-1 bg-white rounded border border-gray-200">
                {r.min}-{r.max}%: Grade {r.grade}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, isCompleted }: { status: string; isCompleted: boolean }) {
  if (isCompleted) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        ✓ Completed
      </span>
    )
  }
  switch (status) {
    case 'generating':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 animate-pulse">
          ⟳ Generating...
        </span>
      )
    case 'ready':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          ✓ Ready
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          ✗ Failed
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          Pending
        </span>
      )
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className ?? ''}`} />
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const CONTENT_TYPES = [
  { key: 'study_guide', label: 'Study Guide' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'flashcards', label: 'Flashcards' },
  { key: 'formula_sheet', label: 'Formula Sheet' },
  { key: 'mock_exam', label: 'Mock Exam' },
]

export default function StudyPlanPage() {
  const params = useParams()
  const router = useRouter()
  const { isLoaded, isSignedIn, getToken } = useAuth()

  const planId = params?.id as string

  const [plan, setPlan] = useState<PlanData | null>(null)
  const [planLoading, setPlanLoading] = useState(true)
  const [planError, setPlanError] = useState<string | null>(null)

  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)
  const [content, setContent] = useState<UnitContent | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<ContentTab>('study_guide')

  const [generating, setGenerating] = useState(false)
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>(['study_guide', 'quiz', 'flashcards', 'formula_sheet', 'mock_exam'])

  const [completing, setCompleting] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const contentRef = useRef<HTMLDivElement>(null)

  // Gaokao chat state
  const [gaokaoMode, setGaokaoMode] = useState(false)
  const [gaokaoMessages, setGaokaoMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: Date }[]>([])
  const [gaokaoInput, setGaokaoInput] = useState('')
  const [gaokaoTyping, setGaokaoTyping] = useState(false)
  const [gaokaoSessionId, setGaokaoSessionId] = useState<string | null>(null)
  const [gaokaoTopicFocus, setGaokaoTopicFocus] = useState('')
  const gaokaoChatEndRef = useRef<HTMLDivElement>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Track unsaved changes for beforeunload warning
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const lastSavedGaokaoCount = useRef(0)

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Mark dirty when gaokao messages change (user sent new messages)
  useEffect(() => {
    const userMsgCount = gaokaoMessages.filter(m => m.role === 'user').length
    if (userMsgCount > lastSavedGaokaoCount.current) {
      setHasUnsavedChanges(true)
    }
  }, [gaokaoMessages])

  // ── Auth helper ────────────────────────────────────────────────────────────

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }, [getToken])

  // ── Fetch plan ─────────────────────────────────────────────────────────────

  const fetchPlan = useCallback(async () => {
    if (!planId) return
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/backend/study-plan/${planId}`, { headers })
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const data = await res.json()
      const fetched: PlanData = data.plan ?? data
      // Preserve local "generating" status if polling is active — prevents
      // a re-fetch (e.g. from token refresh) from briefly clobbering the
      // generating indicator before the backend commit is visible.
      if (pollRef.current) {
        setPlan(prev => {
          if (!prev) return fetched
          return {
            ...fetched,
            units: fetched.units.map(u => {
              const prevUnit = prev.units.find(p => p.id === u.id)
              if (prevUnit?.content_status === 'generating' && u.content_status !== 'generating') {
                return { ...u, content_status: 'generating' as const }
              }
              return u
            }),
          }
        })
      } else {
        setPlan(fetched)
      }
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Failed to load study plan')
    } finally {
      setPlanLoading(false)
    }
  }, [planId, authHeaders])

  useEffect(() => {
    if (isLoaded && planId) {
      fetchPlan()
    }
  }, [isLoaded, planId, fetchPlan])

  // ── Fetch unit content ─────────────────────────────────────────────────────

  const fetchContent = useCallback(async (unitId: string) => {
    setContentLoading(true)
    setContent(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/backend/study-plan/${planId}/unit/${unitId}/content`, { headers })
      if (!res.ok) throw new Error(`Status ${res.status}`)
      const data = await res.json()
      // Map backend field names to frontend field names
      // Flashcards: LLM returns { cards: [...] }, extract the array
      if (data.flashcards && !Array.isArray(data.flashcards)) {
        data.flashcards = data.flashcards.cards || []
      }
      // Formula sheet: LLM returns { sections: [{ category, formulas: [...] }] }, flatten to Formula[]
      const formulaSource = data.formula_sheet || data.formulas
      if (formulaSource && !Array.isArray(formulaSource)) {
        const flat: Formula[] = []
        for (const sec of (formulaSource.sections || [])) {
          for (const f of (sec.formulas || [])) {
            flat.push({ ...f, category: sec.category || 'General' })
          }
        }
        data.formulas = flat
      } else if (formulaSource && Array.isArray(formulaSource)) {
        data.formulas = formulaSource
      }
      if (data.mock_exam && !data.mock_exam_mapped) {
        data.mock_exam_mapped = data.mock_exam
      }
      setContent(data)
    } catch {
      setContent(null)
    } finally {
      setContentLoading(false)
    }
  }, [planId, authHeaders])

  // ── Polling for generating status ──────────────────────────────────────────

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const startPolling = useCallback((unitId: string) => {
    stopPoll()
    let attempts = 0
    const maxAttempts = 60 // 5 minutes at 5s intervals
    let consecutiveErrors = 0
    pollRef.current = setInterval(async () => {
      attempts++
      if (attempts > maxAttempts) {
        stopPoll()
        setGenerating(false)
        // Update local state to show failed
        setPlan(prev => {
          if (!prev) return prev
          return {
            ...prev,
            units: prev.units.map(u =>
              u.id === unitId ? { ...u, content_status: 'failed' } : u
            ),
          }
        })
        return
      }
      try {
        const headers = await authHeaders()
        const res = await fetch(`/api/backend/study-plan/${planId}`, { headers })
        if (!res.ok) {
          consecutiveErrors++
          if (consecutiveErrors >= 3) {
            stopPoll()
            setGenerating(false)
          }
          return
        }
        consecutiveErrors = 0
        const raw = await res.json()
        const data: PlanData = raw.plan ?? raw
        setPlan(data)
        const unit = data.units?.find(u => u.id === unitId)
        if (unit && unit.content_status !== 'generating') {
          stopPoll()
          setGenerating(false)
          if (unit.content_status === 'ready') {
            fetchContent(unitId)
          }
        }
      } catch {
        consecutiveErrors++
        if (consecutiveErrors >= 3) {
          stopPoll()
          setGenerating(false)
          setPlan(prev => {
            if (!prev) return prev
            return {
              ...prev,
              units: prev.units.map(u =>
                u.id === unitId ? { ...u, content_status: 'failed' } : u
              ),
            }
          })
        }
      }
    }, 5000)
  }, [planId, authHeaders, stopPoll, fetchContent])

  useEffect(() => {
    return () => stopPoll()
  }, [stopPoll])

  // Auto-start polling if selected unit is already generating
  useEffect(() => {
    if (!plan || !selectedUnitId) return
    const unit = plan.units?.find(u => u.id === selectedUnitId)
    if (unit?.content_status === 'generating') {
      setGenerating(true)
      if (!pollRef.current) {
        startPolling(selectedUnitId)
      }
    }
  }, [selectedUnitId, plan, startPolling])

  // ── Select unit ────────────────────────────────────────────────────────────

  const handleSelectUnit = useCallback((unit: UnitData) => {
    stopPoll()
    setSelectedUnitId(unit.id)
    setGaokaoMode(false)
    setContent(null)
    setActiveTab('study_guide')

    if (unit.content_status === 'ready' || unit.is_completed) {
      setGenerating(false)
      fetchContent(unit.id)
    } else if (unit.content_status === 'generating') {
      setGenerating(true)
      startPolling(unit.id)
    } else {
      setGenerating(false)
    }
  }, [stopPoll, fetchContent, startPolling])

  // ── Generate content ───────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!selectedUnitId) return
    setGenerating(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/backend/study-plan/${planId}/unit/${selectedUnitId}/generate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content_types: selectedContentTypes }),
      })
      if (!res.ok) {
        setGenerating(false)
        return
      }
      // Update local state to show generating
      setPlan(prev => {
        if (!prev) return prev
        return {
          ...prev,
          units: prev.units.map(u =>
            u.id === selectedUnitId ? { ...u, content_status: 'generating' } : u
          ),
        }
      })
      startPolling(selectedUnitId)
    } catch {
      setGenerating(false)
    }
    // NOTE: Don't setGenerating(false) here — polling will do it when complete
  }, [selectedUnitId, planId, authHeaders, selectedContentTypes, startPolling])

  // ── Mark complete ──────────────────────────────────────────────────────────

  const handleMarkComplete = useCallback(async () => {
    if (!selectedUnitId) return
    setCompleting(true)
    try {
      const headers = await authHeaders()
      await fetch(`/api/backend/study-plan/${planId}/unit/${selectedUnitId}/complete`, {
        method: 'POST',
        headers,
      })
      setPlan(prev => {
        if (!prev) return prev
        const updatedUnits = prev.units.map(u =>
          u.id === selectedUnitId ? { ...u, is_completed: true } : u
        )
        const completedCount = updatedUnits.filter(u => u.is_completed).length
        return {
          ...prev,
          units: updatedUnits,
          progress_percentage: Math.round((completedCount / updatedUnits.length) * 100),
        }
      })
      setHasUnsavedChanges(false)
    } catch {
      // silently ignore
    } finally {
      setCompleting(false)
    }
  }, [selectedUnitId, planId, authHeaders])

  // ── Gaokao chat ────────────────────────────────────────────────────────────

  useEffect(() => {
    gaokaoChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [gaokaoMessages, gaokaoTyping])

  // Initialize gaokao mode when plan loads with framework=gaokao
  useEffect(() => {
    if (plan && plan.framework === 'gaokao' && !gaokaoMode && gaokaoMessages.length === 0) {
      setGaokaoMode(true)
      const subjectLabel = SUBJECT_LABELS[plan.subject] || plan.subject
      setGaokaoMessages([{
        id: 'opening',
        role: 'assistant',
        content: `Welcome to your ${subjectLabel} Gaokao study plan! Ask me anything about ${subjectLabel} or tell me what topic you'd like to review.`,
        timestamp: new Date(),
      }])
    }
  }, [plan, gaokaoMode, gaokaoMessages.length])

  const handleGaokaoSend = useCallback(async () => {
    if (!gaokaoInput.trim() || gaokaoTyping) return

    const userMsg = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: gaokaoInput,
      timestamp: new Date(),
    }
    setGaokaoMessages(prev => [...prev, userMsg])
    const text = gaokaoInput
    setGaokaoInput('')
    setGaokaoTyping(true)

    try {
      const headers = await authHeaders()
      const res = await fetch('/api/backend/gaokao/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          session_id: gaokaoSessionId,
          plan_id: planId,
          subject: plan?.subject || 'math',
          topic_focus: gaokaoTopicFocus || undefined,
        }),
      })
      const data = await res.json()
      if (data.session_id) setGaokaoSessionId(data.session_id)

      setGaokaoMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content || data.response || 'Sorry, I could not process that.',
        timestamp: new Date(),
      }])
      // Chat saved server-side, clear dirty flag
      lastSavedGaokaoCount.current = gaokaoMessages.filter(m => m.role === 'user').length + 1
      setHasUnsavedChanges(false)
    } catch {
      setGaokaoMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Network error. Please try again.',
        timestamp: new Date(),
      }])
    } finally {
      setGaokaoTyping(false)
    }
  }, [gaokaoInput, gaokaoTyping, gaokaoSessionId, planId, plan?.subject, gaokaoTopicFocus, authHeaders, gaokaoMessages])

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedUnit = plan?.units.find(u => u.id === selectedUnitId) ?? null
  const isGaokaoPlan = plan?.framework === 'gaokao'

  // ── Loading / error states ─────────────────────────────────────────────────

  if (planLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-6">
          <div className="w-1/3 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <div className="flex-1">
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    )
  }

  if (planError || !plan) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <p className="text-gray-500">{planError ?? 'Study plan not found'}</p>
          <button
            onClick={() => router.back()}
            className="text-sm text-blue-600 hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  const tabs: { key: ContentTab; label: string }[] = [
    { key: 'study_guide', label: 'Study Guide' },
    { key: 'quiz', label: 'Quiz' },
    { key: 'flashcards', label: 'Flashcards' },
    { key: 'formulas', label: 'Formulas' },
    { key: 'mock_exam', label: 'Mock Exam' },
    { key: 'my_context', label: 'My Context' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-gray-700 p-1 rounded transition-colors"
            aria-label="Go back"
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{plan.title}</h1>
            <p className="text-sm text-gray-500">{SUBJECT_LABELS[plan.subject] || plan.subject} · {FRAMEWORK_LABELS[plan.framework] || plan.framework}</p>
          </div>
        </div>
        <button
          className="md:hidden text-gray-500 p-1"
          onClick={() => setSidebarOpen(v => !v)}
          aria-label="Toggle unit list"
        >
          ☰
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'block' : 'hidden'
          } md:block w-full md:w-80 lg:w-96 shrink-0`}
        >
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Plan meta */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 font-medium">Overall Progress</span>
                <span className="text-xs font-semibold text-gray-700">{plan.progress_percentage}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${plan.progress_percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {plan.units.filter(u => u.is_completed).length} of {plan.units.length} units completed
              </p>
            </div>

            {/* Gaokao tutor button */}
            {isGaokaoPlan && (
              <div className="p-3 border-b border-gray-100">
                <button
                  onClick={() => { setGaokaoMode(true); setSelectedUnitId(null); setSidebarOpen(false) }}
                  className={`w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    gaokaoMode
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-slate-50 text-gray-700 hover:bg-blue-50'
                  }`}
                >
                  <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">G</span>
                  </div>
                  Gaokao AI Tutor
                </button>
              </div>
            )}

            {/* Unit list */}
            <div className="overflow-y-auto max-h-[calc(100vh-320px)]">
              {plan.units
                .slice()
                .sort((a, b) => a.order_index - b.order_index)
                .map(unit => (
                  <button
                    key={unit.id}
                    onClick={() => { handleSelectUnit(unit); setSidebarOpen(false) }}
                    className={`w-full text-left p-4 border-b border-gray-100 last:border-b-0 transition-colors hover:bg-slate-50 ${
                      selectedUnitId === unit.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-gray-500 shrink-0">
                        Unit {unit.order_index + 1}
                      </span>
                      <StatusBadge status={unit.content_status} isCompleted={unit.is_completed} />
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">{unit.title}</p>
                    {unit.topics?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {unit.topics.slice(0, 3).map((topic, ti) => (
                          <span
                            key={ti}
                            className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"
                          >
                            {topic}
                          </span>
                        ))}
                        {unit.topics.length > 3 && (
                          <span className="text-xs text-gray-400">+{unit.topics.length - 3}</span>
                        )}
                      </div>
                    )}
                    {unit.estimated_minutes > 0 && (
                      <p className="text-xs text-gray-400">{unit.estimated_minutes} min</p>
                    )}
                  </button>
                ))}
            </div>
          </div>
        </aside>

        {/* Right Panel */}
        <main className="flex-1 min-w-0">
          {isGaokaoPlan && (gaokaoMode || !selectedUnit) ? (
            /* Gaokao Tutor Chat Panel */
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
              {/* Gaokao header */}
              <div className="px-6 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-sm">G</span>
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Gaokao AI Tutor</h2>
                      <p className="text-xs text-gray-500">{SUBJECT_LABELS[plan.subject] || plan.subject}</p>
                    </div>
                  </div>
                  {plan.units.length > 0 && (
                    <button
                      onClick={() => { setGaokaoMode(false); if (plan.units[0]) handleSelectUnit(plan.units[0]) }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View Units
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={gaokaoTopicFocus}
                  onChange={(e) => setGaokaoTopicFocus(e.target.value)}
                  placeholder="Study topic (optional): e.g. derivatives, electromagnetism..."
                  className="w-full mt-2 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-800"
                />
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {gaokaoMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                    }`}>
                      {msg.content.split('\n').map((line, i) => (
                        <p key={i} className={line.trim() === '' ? 'h-2' : ''}>{line}</p>
                      ))}
                    </div>
                  </div>
                ))}
                {gaokaoTyping && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1 items-center">
                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={gaokaoChatEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-gray-100 px-4 py-3">
                <div className="flex gap-2 items-end">
                  <textarea
                    value={gaokaoInput}
                    onChange={(e) => setGaokaoInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGaokaoSend() } }}
                    placeholder="Ask about any topic... (Enter to send)"
                    rows={1}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-800 max-h-32 overflow-y-auto"
                  />
                  <button
                    onClick={handleGaokaoSend}
                    disabled={!gaokaoInput.trim() || gaokaoTyping}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors flex-shrink-0"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          ) : !selectedUnit ? (
            <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl shadow-sm border border-gray-200 text-center p-8">
              <div className="text-4xl mb-3">📚</div>
              <p className="text-gray-500 text-sm">Select a unit from the left to view its content</p>
            </div>
          ) : selectedUnit.content_status === 'generating' ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-100 mb-2">
                <span className="text-yellow-600 text-xl animate-spin">⟳</span>
              </div>
              <p className="text-gray-700 font-medium">Generating content for this unit…</p>
              <p className="text-sm text-gray-500">This may take a minute. We'll update automatically.</p>
            </div>
          ) : selectedUnit.content_status !== 'ready' && !selectedUnit.is_completed ? (
            // Generate content panel
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">{selectedUnit.title}</h2>
                <p className="text-sm text-gray-500">No content generated yet. Choose what to generate:</p>
              </div>

              <div className="space-y-2">
                {CONTENT_TYPES.map(ct => (
                  <label key={ct.key} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedContentTypes.includes(ct.key)}
                      onChange={e => {
                        setSelectedContentTypes(prev =>
                          e.target.checked ? [...prev, ct.key] : prev.filter(k => k !== ct.key)
                        )
                      }}
                      className="accent-blue-600 w-4 h-4"
                    />
                    <span className="text-sm text-gray-700">{ct.label}</span>
                  </label>
                ))}
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || selectedContentTypes.length === 0}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                {generating ? 'Starting generation…' : 'Generate Content'}
              </button>
            </div>
          ) : contentLoading ? (
            // Content loading skeleton
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
              <Skeleton className="h-6 w-48" />
              <div className="flex gap-2">
                {tabs.map(t => <Skeleton key={t.key} className="h-8 w-24" />)}
              </div>
              <Skeleton className="h-40" />
            </div>
          ) : (
            // Content viewer
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
              {/* Unit header */}
              <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Unit {(selectedUnit.order_index ?? 0) + 1}</p>
                    <h2 className="text-base font-semibold text-gray-900">{selectedUnit.title}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <ScreenshotAskAI
                      containerRef={contentRef}
                      subject={plan.subject}
                      unitTitle={selectedUnit.title}
                      getAuthHeaders={authHeaders}
                    />
                    <StatusBadge status={selectedUnit.content_status} isCompleted={selectedUnit.is_completed} />
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100 overflow-x-auto">
                {tabs.map(tab => {
                  const available =
                    tab.key === 'my_context' ? true
                    : tab.key === 'study_guide' ? !!content?.study_guide
                    : tab.key === 'quiz' ? !!content?.quiz
                    : tab.key === 'flashcards' ? !!content?.flashcards?.length
                    : tab.key === 'mock_exam' ? !!content?.mock_exam?.sections?.length
                    : !!content?.formulas?.length
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      disabled={!available}
                      className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 disabled:opacity-30 ${
                        activeTab === tab.key
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              {/* Tab content */}
              <div className="p-6 relative" ref={contentRef}>
                {activeTab === 'study_guide' && content?.study_guide && (
                  <StudyGuideTab guide={content.study_guide} />
                )}
                {activeTab === 'quiz' && content?.quiz && (
                  <QuizTab quiz={content.quiz} />
                )}
                {activeTab === 'flashcards' && content?.flashcards && (
                  <FlashcardsTab cards={content.flashcards} />
                )}
                {activeTab === 'formulas' && content?.formulas && (
                  <FormulasTab formulas={content.formulas} />
                )}
                {activeTab === 'mock_exam' && content?.mock_exam && (
                  <MockExamTab exam={content.mock_exam} />
                )}
                {activeTab === 'my_context' && (
                  <MediaContextTab getAuthHeaders={authHeaders} />
                )}
                {!content && activeTab !== 'my_context' && (
                  <p className="text-gray-500 italic text-sm">No content available for this tab.</p>
                )}
                <HighlightAskAI
                  containerRef={contentRef}
                  subject={plan.subject}
                  unitTitle={selectedUnit.title}
                  getAuthHeaders={authHeaders}
                />
              </div>

              {/* Mark complete */}
              <div className="px-6 pb-6">
                <button
                  onClick={handleMarkComplete}
                  disabled={completing || selectedUnit.is_completed}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    selectedUnit.is_completed
                      ? 'bg-green-100 text-green-700 cursor-default'
                      : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40'
                  }`}
                >
                  {completing ? 'Saving…' : selectedUnit.is_completed ? '✓ Unit Completed' : 'Mark as Complete'}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
