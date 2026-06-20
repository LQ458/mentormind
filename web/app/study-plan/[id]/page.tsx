'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '../../components/AuthContext'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import DOMPurify from 'dompurify'
import { HighlightAskAI, ScreenshotAskAI } from './AskAI'
import MediaContextTab from './MediaContext'
import { useLanguage } from '../../components/LanguageContext'
import { toast } from 'sonner'
import { pushNotification } from '../../lib/notifications'

// Restrict allowed tags/attrs to KaTeX's output surface so that AI-derived math
// strings can't smuggle <img onerror=…> or <script> into the page. DOMPurify
// only runs in the browser; SSR returns the input unchanged because the actual
// render happens after hydration.
const KATEX_ALLOWED_TAGS = [
  'span', 'math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub',
  'mfrac', 'msqrt', 'mtext', 'annotation', 'semantics',
]
const KATEX_ALLOWED_ATTR = ['class', 'style', 'aria-hidden']
const sanitizeLatex = (html: string): string =>
  typeof window === 'undefined'
    ? html
    : DOMPurify.sanitize(html, {
        ALLOWED_TAGS: KATEX_ALLOWED_TAGS,
        ALLOWED_ATTR: KATEX_ALLOWED_ATTR,
      })

// ── Active-generation persistence (localStorage) ─────────────────────────────
const ACTIVE_GEN_KEY = 'mm-active-unit-generation-v1'
interface ActiveGenRecord {
  planId: string
  unitId: string
  startedAt: number
  contentTypes: string[]
}
function loadActiveGen(planId: string): ActiveGenRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ACTIVE_GEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ActiveGenRecord
    if (parsed.planId !== planId) return null
    // Stale after 30 minutes
    if (Date.now() - parsed.startedAt > 30 * 60 * 1000) {
      window.localStorage.removeItem(ACTIVE_GEN_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}
function saveActiveGen(rec: ActiveGenRecord) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(ACTIVE_GEN_KEY, JSON.stringify(rec)) } catch {}
}
function clearActiveGen() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(ACTIVE_GEN_KEY) } catch {}
}

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
  generation_started_at?: string | null
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

const SUBJECT_LABELS_ZH: Record<string, string> = {
  math: '数学', physics: '物理', chemistry: '化学',
  biology: '生物', cs: '计算机科学', history: '历史',
  english: '英语', economics: '经济学', psychology: '心理学',
  government: '政府与政治', world_languages: '世界语言',
  environmental_science: '环境科学', art: '艺术', general: '通用',
}

const FRAMEWORK_LABELS: Record<string, string> = {
  ap: 'AP', a_level: 'A Level', ib: 'IB', gaokao: 'Gaokao', general: 'General',
}

const FRAMEWORK_LABELS_ZH: Record<string, string> = {
  ap: 'AP', a_level: 'A Level', ib: 'IB', gaokao: '高考', general: '通用',
}

function subjectLabel(subject: string, lang: 'zh' | 'en') {
  return (lang === 'zh' ? SUBJECT_LABELS_ZH[subject] : SUBJECT_LABELS[subject]) || subject
}

function frameworkLabel(framework: string, lang: 'zh' | 'en') {
  return (lang === 'zh' ? FRAMEWORK_LABELS_ZH[framework] : FRAMEWORK_LABELS[framework]) || framework
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
        <span key={i++} className="block my-2" dangerouslySetInnerHTML={{ __html: sanitizeLatex(renderLatex(m[1], true)) }} />
      )
    } else if (m[2] !== undefined) {
      // $inline math$
      parts.push(
        <span key={i++} className="inline-math" dangerouslySetInnerHTML={{ __html: sanitizeLatex(renderLatex(m[2])) }} />
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

function EducationalImagesBlock({ images, lang }: { images: EducationalImage[]; lang: 'zh' | 'en' }) {
  if (!images?.length) return null
  return (
    <div className="mt-6 border-t border-gray-200 pt-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
        {lang === 'zh' ? '相关图片' : 'Related Images'}
      </h4>
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

function StudyGuideTab({ guide, lang }: { guide: StudyGuide; lang: 'zh' | 'en' }) {
  if (!guide?.sections?.length) {
    return <p className="text-gray-500 italic">{lang === 'zh' ? '暂无学习讲义内容。' : 'No study guide content available.'}</p>
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
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                {lang === 'zh' ? '例题' : 'Examples'}
              </h4>
              <div className="space-y-3">
                {section.examples.map((ex, ei) => {
                  if (typeof ex === 'object' && ex !== null) {
                    const { problem, solution, explanation } = ex as { problem?: string; solution?: string; explanation?: string }
                    return (
                      <div key={ei} className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 space-y-2">
                        {problem && (
                          <div>
                            <span className="text-xs font-semibold text-blue-600 uppercase">{lang === 'zh' ? '题目' : 'Problem'}</span>
                            <p className="text-sm text-gray-800 mt-0.5"><TextBlock text={problem} /></p>
                          </div>
                        )}
                        {solution && (
                          <div>
                            <span className="text-xs font-semibold text-green-600 uppercase">{lang === 'zh' ? '解法' : 'Solution'}</span>
                            <p className="text-sm text-gray-700 mt-0.5"><TextBlock text={solution} /></p>
                          </div>
                        )}
                        {explanation && (
                          <div>
                            <span className="text-xs font-semibold text-gray-500 uppercase">{lang === 'zh' ? '解析' : 'Explanation'}</span>
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
              <h4 className="text-xs font-semibold uppercase tracking-wide text-red-500 mb-2">
                {lang === 'zh' ? '常见错误' : 'Common Mistakes'}
              </h4>
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
      <EducationalImagesBlock images={guide.educational_images ?? []} lang={lang} />
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
  const userLetterMatch = u.match(/^([a-d])$/)
  const correctChoiceLetterMatch = c.match(/^([a-d])\)/)
  if (userLetterMatch && correctChoiceLetterMatch) {
    return userLetterMatch[1] === correctChoiceLetterMatch[1]
  }
  // Handle case where correct_answer is "D) ..." and choice is just selected
  const choiceLetterMatch = u.match(/^([a-d])\)/)
  const ansLetterMatch = c.match(/^([a-d])\)/)
  if (choiceLetterMatch && ansLetterMatch) {
    return choiceLetterMatch[1] === ansLetterMatch[1]
  }
  return false
}

function QuizTab({ quiz, lang }: { quiz: Quiz; lang: 'zh' | 'en' }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(0)

  const questions = quiz?.questions ?? []

  if (!questions.length) {
    return <p className="text-gray-500 italic">{lang === 'zh' ? '暂无小测题目。' : 'No quiz questions available.'}</p>
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
            {showAll ? (lang === 'zh' ? '逐题显示' : 'One at a time') : (lang === 'zh' ? '显示全部' : 'Show all')}
          </button>
          {submitted && (
            <span className="text-sm font-medium text-gray-700">
              {lang === 'zh' ? '得分' : 'Score'}: <span className="text-green-600 font-semibold">{score}/{questions.length}</span>
            </span>
          )}
        </div>
        {submitted && (
          <button
            onClick={handleReset}
            className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            {lang === 'zh' ? '重做' : 'Retry'}
          </button>
        )}
      </div>

      {displayQuestions.map((q) => {
        const userAnswer = answers[q.id] ?? ''
        const isCorrect = submitted && matchesAnswer(userAnswer, q.correct_answer)
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
                placeholder={lang === 'zh' ? '输入你的答案…' : 'Type your answer...'}
                rows={3}
                className="w-full text-sm rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-60"
              />
            )}

            {submitted && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold text-gray-500">
                  {isCorrect
                    ? (lang === 'zh' ? '✓ 答对了！' : '✓ Correct!')
                    : `${lang === 'zh' ? '✗ 正确答案' : '✗ Correct answer'}: ${q.correct_answer}`}
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
            {lang === 'zh' ? '上一题' : 'Previous'}
          </button>
          <span className="text-xs text-gray-500">
            {currentIdx + 1} / {questions.length}
          </span>
          <button
            onClick={() => setCurrentIdx(i => Math.min(questions.length - 1, i + 1))}
            disabled={currentIdx === questions.length - 1}
            className="text-sm px-4 py-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors text-gray-700"
          >
            {lang === 'zh' ? '下一题' : 'Next'}
          </button>
        </div>
      )}

      {!submitted && (
        <button
          onClick={handleSubmit}
          disabled={Object.keys(answers).length === 0}
          className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium transition-colors"
        >
          {lang === 'zh' ? '提交答案' : 'Submit Answers'}
        </button>
      )}
    </div>
  )
}

// ── Flashcards Tab ────────────────────────────────────────────────────────────

function FlashcardsTab({ cards, lang }: { cards: Flashcard[]; lang: 'zh' | 'en' }) {
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)

  if (!cards?.length) {
    return <p className="text-gray-500 italic">{lang === 'zh' ? '暂无记忆卡。' : 'No flashcards available.'}</p>
  }

  const card = cards[idx]

  const goTo = (next: number) => {
    setFlipped(false)
    setIdx(next)
  }

  return (
    <div className="space-y-5">
      <div className="text-center text-xs text-gray-500">
        {lang === 'zh'
          ? `第 ${idx + 1} / ${cards.length} 张 - 点击卡片翻面`
          : `Card ${idx + 1} of ${cards.length} - click card to flip`}
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
            <span className="text-xs uppercase tracking-wide text-blue-500 mb-3 font-semibold">{lang === 'zh' ? '正面' : 'Front'}</span>
            <p className="text-base font-medium text-gray-900 leading-relaxed">
              <TextBlock text={card.front} />
            </p>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border-2 border-purple-200 bg-purple-50 p-6 text-center shadow-sm"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <span className="text-xs uppercase tracking-wide text-purple-500 mb-3 font-semibold">{lang === 'zh' ? '背面' : 'Back'}</span>
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
          {lang === 'zh' ? '上一张' : 'Previous'}
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
          {lang === 'zh' ? '下一张' : 'Next'}
        </button>
      </div>
    </div>
  )
}

// ── Formulas Tab ──────────────────────────────────────────────────────────────

function FormulasTab({ formulas, lang }: { formulas: Formula[]; lang: 'zh' | 'en' }) {
  if (!formulas?.length) {
    return <p className="text-gray-500 italic">{lang === 'zh' ? '暂无公式内容。' : 'No formulas available.'}</p>
  }

  const byCategory = formulas.reduce<Record<string, Formula[]>>((acc, f) => {
    const cat = f.category || (lang === 'zh' ? '通用' : 'General')
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
                        <span className="font-medium">{lang === 'zh' ? '变量：' : 'Variables:'}</span> {f.variables}
                      </p>
                    )}
                    {f.usage && (
                      <p className="text-xs text-gray-600">
                        <span className="font-medium">{lang === 'zh' ? '用法：' : 'Usage:'}</span> {f.usage}
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

function MockExamTab({ exam, lang }: { exam: MockExam; lang: 'zh' | 'en' }) {
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
        if (userAnswer && matchesAnswer(userAnswer, q.correct_answer)) {
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
            {lang === 'zh'
              ? `限时：${exam.time_limit_minutes} 分钟 · 总分：${exam.total_points} 分`
              : `Time limit: ${exam.time_limit_minutes} min · Total: ${exam.total_points} points`}
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
              {lang === 'zh'
                ? `${section.time_minutes} 分钟 · 权重 ${section.weight_percentage}%`
                : `${section.time_minutes} min · ${section.weight_percentage}% weight`}
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {section.questions.map((q) => {
              const qKey = `${q.id}`
              const isCorrect = submitted && matchesAnswer(answers[qKey] ?? '', q.correct_answer)
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
                            const isCorrectChoice = submitted && matchesAnswer(choiceLetter, q.correct_answer)
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
                                    : isCorrectChoice
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
                          placeholder={lang === 'zh' ? '输入你的答案…' : 'Type your answer...'}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        />
                      )}
                      {submitted && q.explanation && (
                        <div className="mt-2 p-2 bg-blue-50 rounded-lg text-xs text-blue-800">
                          <span className="font-medium">{lang === 'zh' ? '解析：' : 'Explanation:'}</span>{' '}
                          <TextBlock text={q.explanation} />
                        </div>
                      )}
                      <span className="text-xs text-gray-400 mt-1 inline-block">
                        {lang === 'zh' ? `${q.points} 分` : `${q.points} pt${q.points !== 1 ? 's' : ''}`}
                      </span>
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
            {lang === 'zh' ? '提交模拟卷' : 'Submit Exam'}
          </button>
        ) : (
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
          >
            {lang === 'zh' ? '重做模拟卷' : 'Retake Exam'}
          </button>
        )}
      </div>

      {submitted && exam.score_conversion && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-2">{lang === 'zh' ? '分数换算' : 'Score Conversion'}</p>
          <p className="text-xs text-gray-500 mb-2">{exam.score_conversion.description}</p>
          <div className="flex flex-wrap gap-2">
            {exam.score_conversion.ranges.map((r, i) => (
              <span key={i} className="text-xs px-2 py-1 bg-white rounded border border-gray-200">
                {lang === 'zh' ? `${r.min}-${r.max}%：等级 ${r.grade}` : `${r.min}-${r.max}%: Grade ${r.grade}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, isCompleted, lang = 'en' }: { status: string; isCompleted: boolean; lang?: 'zh' | 'en' }) {
  if (isCompleted) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        ✓ {lang === 'zh' ? '已完成' : 'Completed'}
      </span>
    )
  }
  switch (status) {
    case 'generating':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 animate-pulse">
          ⟳ {lang === 'zh' ? '生成中' : 'Generating'}
        </span>
      )
    case 'ready':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          ✓ {lang === 'zh' ? '可学习' : 'Ready'}
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          ✗ {lang === 'zh' ? '失败' : 'Failed'}
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          {lang === 'zh' ? '待生成' : 'Pending'}
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
  { key: 'study_guide', en: 'Study Guide', zh: '学习讲义' },
  { key: 'quiz', en: 'Quiz', zh: '小测' },
  { key: 'flashcards', en: 'Flashcards', zh: '记忆卡' },
  { key: 'formula_sheet', en: 'Formula Sheet', zh: '公式表' },
  { key: 'mock_exam', en: 'Mock Exam', zh: '模拟卷' },
]

const CONTENT_TAB_LABELS: Record<ContentTab, { en: string; zh: string }> = {
  study_guide: { en: 'Study Guide', zh: '学习讲义' },
  quiz: { en: 'Quiz', zh: '小测' },
  flashcards: { en: 'Flashcards', zh: '记忆卡' },
  formulas: { en: 'Formulas', zh: '公式表' },
  mock_exam: { en: 'Mock Exam', zh: '模拟卷' },
  my_context: { en: 'My Context', zh: '我的材料' },
}

const GENERATED_TAB_ORDER: ContentTab[] = ['study_guide', 'quiz', 'flashcards', 'formulas', 'mock_exam']

function hasGeneratedContentForTab(content: UnitContent | null, tab: ContentTab): boolean {
  if (!content) return false
  if (tab === 'study_guide') return Boolean(content.study_guide)
  if (tab === 'quiz') return Boolean(content.quiz?.questions?.length)
  if (tab === 'flashcards') return Boolean(content.flashcards?.length)
  if (tab === 'formulas') return Boolean(content.formulas?.length)
  if (tab === 'mock_exam') return Boolean(content.mock_exam?.sections?.length)
  return true
}

function bestContentTab(content: UnitContent | null): ContentTab {
  return GENERATED_TAB_ORDER.find(tab => hasGeneratedContentForTab(content, tab)) ?? 'study_guide'
}

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
  const { language: uiLanguage } = useLanguage()
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
      // Preserve local "generating" only while the backend has not committed
      // the dispatch yet. Once the server says ready/failed, trust it so users
      // do not get trapped in a stale spinner.
      if (pollRef.current) {
        setPlan(prev => {
          if (!prev) return fetched
          return {
            ...fetched,
            units: fetched.units.map(u => {
              const prevUnit = prev.units.find(p => p.id === u.id)
              if (prevUnit?.content_status === 'generating' && u.content_status === 'pending') {
                return {
                  ...u,
                  content_status: 'generating' as const,
                  generation_started_at: prevUnit.generation_started_at || u.generation_started_at,
                }
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
      setActiveTab(bestContentTab(data))
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

  const markUnitGenerationFailed = useCallback((unitId: string) => {
    setPlan(prev => {
      if (!prev) return prev
      return {
        ...prev,
        units: prev.units.map(u =>
          u.id === unitId ? { ...u, content_status: 'failed' } : u
        ),
      }
    })
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
        clearActiveGen()
        markUnitGenerationFailed(unitId)
        toast.error(uiLanguage === 'zh'
          ? '生成等待超时。请刷新后重试，或先只生成学习讲义/小测。'
          : 'Generation timed out. Refresh and retry, or generate only Study Guide / Quiz first.')
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
            clearActiveGen()
            markUnitGenerationFailed(unitId)
            toast.error(uiLanguage === 'zh'
              ? '无法确认生成状态，已停止等待。请刷新后重试。'
              : 'Could not confirm generation status. Refresh and retry.')
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
          clearActiveGen()
          if (unit.content_status === 'ready') {
            fetchContent(unitId)
            toast.success(uiLanguage === 'zh' ? `《${unit.title}》已生成完成` : `"${unit.title}" is ready`)
            pushNotification({
              kind: 'lesson',
              icon: '✅',
              title: uiLanguage === 'zh' ? `生成完成：${unit.title}` : `Ready: ${unit.title}`,
              body: uiLanguage === 'zh' ? '点击查看课程内容。' : 'Tap to view the lesson.',
              href: `/study-plan/${planId}`,
            })
          } else if (unit.content_status === 'failed') {
            toast.error(uiLanguage === 'zh' ? `《${unit.title}》生成失败` : `"${unit.title}" generation failed`)
            pushNotification({
              kind: 'system',
              icon: '⚠️',
              title: uiLanguage === 'zh' ? `生成失败：${unit.title}` : `Failed: ${unit.title}`,
              body: uiLanguage === 'zh' ? '请重试或联系支持。' : 'Try again or contact support.',
              href: `/study-plan/${planId}`,
            })
          }
        }
      } catch {
        consecutiveErrors++
        if (consecutiveErrors >= 3) {
          stopPoll()
          setGenerating(false)
          clearActiveGen()
          markUnitGenerationFailed(unitId)
          toast.error(uiLanguage === 'zh'
            ? '无法确认生成状态，已停止等待。请刷新后重试。'
            : 'Could not confirm generation status. Refresh and retry.')
        }
      }
    }, 5000)
  }, [planId, authHeaders, stopPoll, fetchContent, uiLanguage, markUnitGenerationFailed])

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

  // Auto-resume the in-progress unit on page mount.
  // If user kicked off generation, navigated away, then came back, jump them
  // straight to that unit so they see the progress.
  const resumedRef = useRef(false)
  useEffect(() => {
    if (!plan || resumedRef.current || selectedUnitId) return
    const rec = loadActiveGen(planId)
    if (!rec) return
    const unit = plan.units?.find(u => u.id === rec.unitId)
    if (!unit) {
      clearActiveGen()
      return
    }
    if (unit.content_status === 'generating') {
      resumedRef.current = true
      setSelectedUnitId(rec.unitId)
      const elapsed = Math.round((Date.now() - rec.startedAt) / 1000)
      toast.info(uiLanguage === 'zh'
        ? `继续追踪《${unit.title}》的生成进度（已 ${elapsed}s）`
        : `Resuming "${unit.title}" generation (${elapsed}s elapsed)`)
    } else {
      // Server already finished while we were away — surface a notification.
      clearActiveGen()
      if (unit.content_status === 'ready') {
        pushNotification({
          kind: 'lesson',
          icon: '✅',
          title: uiLanguage === 'zh' ? `生成完成：${unit.title}` : `Ready: ${unit.title}`,
          body: uiLanguage === 'zh' ? '您离开期间课程已生成完成。' : 'Finished while you were away.',
          href: `/study-plan/${planId}`,
        })
      }
    }
  }, [plan, planId, selectedUnitId, uiLanguage])

  // ── Select unit ────────────────────────────────────────────────────────────

  const handleSelectUnit = useCallback((unit: UnitData) => {
    stopPoll()
    setSelectedUnitId(unit.id)
    setGaokaoMode(false)
    setContent(null)
    setActiveTab(bestContentTab(null))

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

  useEffect(() => {
    if (!plan || selectedUnitId || plan.framework === 'gaokao') return
    const firstUnit = plan.units?.slice().sort((a, b) => a.order_index - b.order_index)[0]
    if (firstUnit) handleSelectUnit(firstUnit)
  }, [plan, selectedUnitId, handleSelectUnit])

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
        toast.error(uiLanguage === 'zh' ? '生成请求失败' : 'Generation request failed')
        return
      }
      // Persist active generation so we can resume on reload / nav.
      const startedAt = Date.now()
      const startedAtIso = new Date(startedAt).toISOString()
      saveActiveGen({
        planId,
        unitId: selectedUnitId,
        startedAt,
        contentTypes: selectedContentTypes,
      })
      const unitTitle = plan?.units?.find(u => u.id === selectedUnitId)?.title || 'Unit'
      toast.info(uiLanguage === 'zh'
        ? `开始生成《${unitTitle}》，可以离开页面，完成后会通知你。`
        : `Generating "${unitTitle}". You can leave this page; we'll notify you when ready.`)
      pushNotification({
        kind: 'lesson',
        icon: '⏳',
        title: uiLanguage === 'zh' ? `开始生成：${unitTitle}` : `Started generating: ${unitTitle}`,
        body: uiLanguage === 'zh' ? '我们会在课程内容准备好时通知你。' : "We'll notify you when the content is ready.",
        href: `/study-plan/${planId}`,
      })
      // Update local state to show generating
      setPlan(prev => {
        if (!prev) return prev
        return {
          ...prev,
          units: prev.units.map(u =>
            u.id === selectedUnitId ? { ...u, content_status: 'generating', generation_started_at: startedAtIso } : u
          ),
        }
      })
      startPolling(selectedUnitId)
    } catch {
      setGenerating(false)
      toast.error(uiLanguage === 'zh' ? '生成失败' : 'Generation failed')
    }
    // NOTE: Don't setGenerating(false) here — polling will do it when complete
  }, [selectedUnitId, planId, authHeaders, selectedContentTypes, startPolling, plan, uiLanguage])

  // ── Start AI board lesson ─────────────────────────────────────────────────
  const [startingBoard, setStartingBoard] = useState(false)
  const [boardError, setBoardError] = useState<string | null>(null)
  const handleStartBoardLesson = useCallback(async (unitId: string) => {
    if (!unitId || !planId) return
    setStartingBoard(true)
    setBoardError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(
        `/api/backend/study-plan/${planId}/unit/${unitId}/board-lesson`,
        { method: 'POST', headers, body: JSON.stringify({ language: uiLanguage }) },
      )
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        setBoardError(errJson?.error || 'Failed to start board lesson')
        setStartingBoard(false)
        return
      }
      const data: { session_id?: string } = await res.json().catch(() => ({}))
      if (data.session_id) {
        router.push(`/board/${data.session_id}`)
      } else {
        setBoardError('Missing session_id from backend')
      }
    } catch (err) {
      setBoardError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setStartingBoard(false)
    }
  }, [planId, authHeaders, router, uiLanguage])

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
      const lang = uiLanguage === 'zh' ? 'zh' : 'en'
      const planSubjectLabel = subjectLabel(plan.subject, lang)
      setGaokaoMessages([{
        id: 'opening',
        role: 'assistant',
        content: lang === 'zh'
          ? `欢迎进入你的${planSubjectLabel}高考学习计划。你可以问我任何和${planSubjectLabel}有关的问题，也可以告诉我想复习的主题。`
          : `Welcome to your ${planSubjectLabel} Gaokao study plan! Ask me anything about ${planSubjectLabel} or tell me what topic you'd like to review.`,
        timestamp: new Date(),
      }])
    }
  }, [plan, gaokaoMode, gaokaoMessages.length, uiLanguage])

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
        content: data.content || data.response || (uiLanguage === 'zh' ? '抱歉，我刚才没处理成功，请再试一次。' : 'Sorry, I could not process that.'),
        timestamp: new Date(),
      }])
      // Chat saved server-side, clear dirty flag
      lastSavedGaokaoCount.current = gaokaoMessages.filter(m => m.role === 'user').length + 1
      setHasUnsavedChanges(false)
    } catch {
      setGaokaoMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: uiLanguage === 'zh' ? '网络错误，请重试。' : 'Network error. Please try again.',
        timestamp: new Date(),
      }])
    } finally {
      setGaokaoTyping(false)
    }
  }, [gaokaoInput, gaokaoTyping, gaokaoSessionId, planId, plan?.subject, gaokaoTopicFocus, authHeaders, gaokaoMessages, uiLanguage])

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedUnit = plan?.units.find(u => u.id === selectedUnitId) ?? null
  const isGaokaoPlan = plan?.framework === 'gaokao'
  const lang = uiLanguage === 'zh' ? 'zh' : 'en'
  const unitLabel = lang === 'zh' ? '单元' : 'Unit'
  const generationStartedMs = selectedUnit?.generation_started_at ? Date.parse(selectedUnit.generation_started_at) : NaN
  const generationElapsedSeconds = Number.isFinite(generationStartedMs)
    ? Math.max(0, Math.round((Date.now() - generationStartedMs) / 1000))
    : null
  const generationElapsedLabel = generationElapsedSeconds === null
    ? null
    : generationElapsedSeconds < 60
      ? (lang === 'zh' ? `${generationElapsedSeconds} 秒` : `${generationElapsedSeconds}s`)
      : (lang === 'zh'
        ? `${Math.floor(generationElapsedSeconds / 60)} 分 ${generationElapsedSeconds % 60} 秒`
        : `${Math.floor(generationElapsedSeconds / 60)}m ${generationElapsedSeconds % 60}s`)

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
    const lang = uiLanguage === 'zh' ? 'zh' : 'en'
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-4">
          <p className="text-gray-500">{planError ?? (lang === 'zh' ? '没有找到学习计划' : 'Study plan not found')}</p>
          <button
            onClick={() => router.back()}
            className="text-sm text-blue-600 hover:underline"
          >
            {lang === 'zh' ? '返回' : 'Go back'}
          </button>
        </div>
      </div>
    )
  }

  const tabs: { key: ContentTab; label: string }[] = [
    { key: 'study_guide', label: lang === 'zh' ? CONTENT_TAB_LABELS.study_guide.zh : CONTENT_TAB_LABELS.study_guide.en },
    { key: 'quiz', label: lang === 'zh' ? CONTENT_TAB_LABELS.quiz.zh : CONTENT_TAB_LABELS.quiz.en },
    { key: 'flashcards', label: lang === 'zh' ? CONTENT_TAB_LABELS.flashcards.zh : CONTENT_TAB_LABELS.flashcards.en },
    { key: 'formulas', label: lang === 'zh' ? CONTENT_TAB_LABELS.formulas.zh : CONTENT_TAB_LABELS.formulas.en },
    { key: 'mock_exam', label: lang === 'zh' ? CONTENT_TAB_LABELS.mock_exam.zh : CONTENT_TAB_LABELS.mock_exam.en },
    { key: 'my_context', label: lang === 'zh' ? CONTENT_TAB_LABELS.my_context.zh : CONTENT_TAB_LABELS.my_context.en },
  ]
  const activeTabLabel = tabs.find(tab => tab.key === activeTab)?.label ?? CONTENT_TAB_LABELS.study_guide[lang]
  const activeTabHasContent = activeTab === 'my_context' || hasGeneratedContentForTab(content, activeTab)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-gray-700 p-1 rounded transition-colors"
            aria-label={lang === 'zh' ? '返回' : 'Go back'}
          >
            ←
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{plan.title}</h1>
            <p className="text-sm text-gray-500">{subjectLabel(plan.subject, lang)} · {frameworkLabel(plan.framework, lang)}</p>
          </div>
        </div>
        <button
          className="md:hidden inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600"
          onClick={() => setSidebarOpen(v => !v)}
          aria-label={lang === 'zh' ? '展开或收起单元列表' : 'Toggle unit list'}
        >
          <span aria-hidden>☰</span>
          <span>{lang === 'zh' ? '单元' : 'Units'}</span>
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
                <span className="text-xs text-gray-500 font-medium">{lang === 'zh' ? '总体进度' : 'Overall Progress'}</span>
                <span className="text-xs font-semibold text-gray-700">{plan.progress_percentage}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${plan.progress_percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {lang === 'zh'
                  ? `已完成 ${plan.units.filter(u => u.is_completed).length} / ${plan.units.length} 个单元`
                  : `${plan.units.filter(u => u.is_completed).length} of ${plan.units.length} units completed`}
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
                  {lang === 'zh' ? '高考 AI 导师' : 'Gaokao AI Tutor'}
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
                        {unitLabel} {unit.order_index + 1}
                      </span>
                      <StatusBadge status={unit.content_status} isCompleted={unit.is_completed} lang={lang} />
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
                      <p className="text-xs text-gray-400">{unit.estimated_minutes} {lang === 'zh' ? '分钟' : 'min'}</p>
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
                      <h2 className="text-sm font-semibold text-gray-900">
                        {lang === 'zh' ? '高考 AI 导师' : 'Gaokao AI Tutor'}
                      </h2>
                      <p className="text-xs text-gray-500">{subjectLabel(plan.subject, lang)}</p>
                    </div>
                  </div>
                  {plan.units.length > 0 && (
                    <button
                      onClick={() => { setGaokaoMode(false); if (plan.units[0]) handleSelectUnit(plan.units[0]) }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {lang === 'zh' ? '查看单元' : 'View Units'}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={gaokaoTopicFocus}
                  onChange={(e) => setGaokaoTopicFocus(e.target.value)}
                  placeholder={lang === 'zh' ? '学习主题（可选）：例如导数、圆锥曲线…' : 'Study topic (optional): e.g. derivatives, electromagnetism...'}
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
                    placeholder={lang === 'zh' ? '问任何主题…（回车发送）' : 'Ask about any topic... (Enter to send)'}
                    rows={1}
                    className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white text-gray-800 max-h-32 overflow-y-auto"
                  />
                  <button
                    onClick={handleGaokaoSend}
                    disabled={!gaokaoInput.trim() || gaokaoTyping}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors flex-shrink-0"
                  >
                    {lang === 'zh' ? '发送' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          ) : !selectedUnit ? (
            <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl shadow-sm border border-gray-200 text-center p-8">
              <div className="text-4xl mb-3">📚</div>
              <p className="text-gray-500 text-sm">{lang === 'zh' ? '请选择一个单元查看内容' : 'Select a unit from the left to view its content'}</p>
              {plan.units.length > 0 && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 md:hidden"
                >
                  {lang === 'zh' ? `查看 ${plan.units.length} 个单元` : `View ${plan.units.length} units`}
                </button>
              )}
            </div>
          ) : selectedUnit.content_status === 'generating' ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-yellow-100 mb-2">
                <span className="text-yellow-600 text-xl animate-spin">⟳</span>
              </div>
              <p className="text-gray-700 font-medium">{lang === 'zh' ? '正在生成这个单元的内容…' : 'Generating content for this unit…'}</p>
              <p className="text-sm text-gray-500">{lang === 'zh' ? '通常需要 1-2 分钟，完成后会自动更新。' : "This may take a minute. We'll update automatically."}</p>
              {generationElapsedLabel && (
                <p className="text-xs text-gray-400">
                  {lang === 'zh' ? `已等待 ${generationElapsedLabel}` : `Waiting for ${generationElapsedLabel}`}
                </p>
              )}
              {generationElapsedSeconds !== null && generationElapsedSeconds >= 120 && (
                <div className="mx-auto max-w-md rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 space-y-2">
                  <p>
                    {lang === 'zh'
                      ? '如果继续等待很久，可以稍后回来；若状态没有变化，请刷新状态或稍后只生成“学习讲义/小测”。'
                      : 'If this keeps taking a while, you can come back later. If the status does not change, refresh the status or retry later with only Study Guide / Quiz.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => { void fetchPlan() }}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    {lang === 'zh' ? '刷新状态' : 'Refresh status'}
                  </button>
                </div>
              )}
            </div>
          ) : selectedUnit.content_status !== 'ready' && !selectedUnit.is_completed ? (
            // Generate content panel
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">{selectedUnit.title}</h2>
                {selectedUnit.content_status === 'failed' ? (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {lang === 'zh'
                      ? '上次生成没有成功。可以直接重试，或只勾选“学习讲义/小测”先生成核心内容。'
                      : 'The last generation did not finish. Retry, or generate only Study Guide / Quiz first.'}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    {lang === 'zh' ? '还没有生成内容。请选择要生成的模块：' : 'No content generated yet. Choose what to generate:'}
                  </p>
                )}
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
                    <span className="text-sm text-gray-700">{lang === 'zh' ? ct.zh : ct.en}</span>
                  </label>
                ))}
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || selectedContentTypes.length === 0}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                {generating
                  ? (lang === 'zh' ? '开始生成中…' : 'Starting generation…')
                  : selectedUnit.content_status === 'failed'
                    ? (lang === 'zh' ? '重试生成' : 'Retry Generation')
                    : (lang === 'zh' ? '生成内容' : 'Generate Content')}
              </button>

              <button
                onClick={() => selectedUnitId && handleStartBoardLesson(selectedUnitId)}
                disabled={startingBoard || !selectedUnitId}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-sm font-medium transition-colors inline-flex items-center justify-center gap-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="2" y="4" width="20" height="14" rx="2" />
                  <path d="M6 20h12" />
                  <path d="M12 18v2" />
                  <path d="M6 9l3 3 5-5" />
                </svg>
                <span>
                  {startingBoard ? (lang === 'zh' ? '启动中…' : 'Starting…') : (lang === 'zh' ? 'AI 板书课' : 'AI Board Lesson')}
                </span>
              </button>
              {boardError && (
                <p className="text-xs text-rose-600">{boardError}</p>
              )}
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
                    <p className="text-xs text-gray-500 mb-0.5">{unitLabel} {(selectedUnit.order_index ?? 0) + 1}</p>
                    <h2 className="text-base font-semibold text-gray-900">{selectedUnit.title}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => selectedUnitId && handleStartBoardLesson(selectedUnitId)}
                      disabled={startingBoard || !selectedUnitId}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-medium transition-colors"
                      title="AI 板书课 / AI Board Lesson"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="2" y="4" width="20" height="14" rx="2" />
                        <path d="M6 20h12" />
                        <path d="M6 9l3 3 5-5" />
                      </svg>
                      <span>{startingBoard ? '...' : (lang === 'zh' ? '板书' : 'Board')}</span>
                    </button>
                    <ScreenshotAskAI
                      containerRef={contentRef}
                      subject={plan.subject}
                      unitTitle={selectedUnit.title}
                      language={lang}
                      getAuthHeaders={authHeaders}
                    />
                    <StatusBadge status={selectedUnit.content_status} isCompleted={selectedUnit.is_completed} lang={lang} />
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-100 overflow-x-auto">
                {tabs.map(tab => {
                  const available = tab.key === 'my_context' || hasGeneratedContentForTab(content, tab.key)
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
                  <StudyGuideTab guide={content.study_guide} lang={lang} />
                )}
                {activeTab === 'quiz' && content?.quiz && (
                  <QuizTab quiz={content.quiz} lang={lang} />
                )}
                {activeTab === 'flashcards' && content?.flashcards && (
                  <FlashcardsTab cards={content.flashcards} lang={lang} />
                )}
                {activeTab === 'formulas' && content?.formulas && (
                  <FormulasTab formulas={content.formulas} lang={lang} />
                )}
                {activeTab === 'mock_exam' && content?.mock_exam && (
                  <MockExamTab exam={content.mock_exam} lang={lang} />
                )}
                {activeTab === 'my_context' && (
                  <MediaContextTab getAuthHeaders={authHeaders} />
                )}
                {!activeTabHasContent && (
                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                    {lang === 'zh'
                      ? `${activeTabLabel} 还没有生成内容。请查看其他可用标签页，或重新生成这个模块。`
                      : `${activeTabLabel} has not been generated for this unit. Try another available tab or regenerate this content type.`}
                  </div>
                )}
                <HighlightAskAI
                  containerRef={contentRef}
                  subject={plan.subject}
                  unitTitle={selectedUnit.title}
                  language={lang}
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
                  {completing
                    ? (lang === 'zh' ? '保存中…' : 'Saving…')
                    : selectedUnit.is_completed
                      ? (lang === 'zh' ? '✓ 单元已完成' : '✓ Unit Completed')
                      : (lang === 'zh' ? '标记为完成' : 'Mark as Complete')}
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
