'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, HelpCircle, ImagePlus, Mic, Sparkles, Trash2, X } from 'lucide-react'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '../components/AuthContext'
import { PageHead } from '../components/design/primitives'
import { MathText } from '../components/MathText'
import ReportIssueButton from '../components/ReportIssueButton'
import { FeedbackMoment } from '../components/FeedbackMoment'
import { SUBJECTS } from '../lib/subjects'
import { FRAMEWORKS, getFramework } from '../lib/frameworks'
import { getCourseSuggestions } from '../lib/course-suggestions'
import { track } from '../lib/telemetry'
import { useIngestUpload, type MediaContext } from '../hooks/useIngestUpload'

// ── Types ────────────────────────────────────────────────────────────────────

type WorkflowPhase = 'selecting' | 'intake' | 'chatting' | 'plan_review' | 'creating' | 'done'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  // v2 smart-interaction fields: when the backend emits an ask_user block,
  // we surface clickable option chips alongside the chat bubble.
  options?: string[]
  allowFreeText?: boolean
}

interface StudyUnit {
  title: string
  topics: string[]
  description?: string
  learning_objectives?: string[]
  estimated_hours?: number
  estimated_minutes?: number
}

interface ProposedPlan {
  title: string
  subject: string
  framework: string
  course_name?: string
  estimated_hours: number
  learner_tier?: 'accelerated' | 'standard' | 'scaffolded' | 'foundation_rebuild' | string
  pedagogy_profile?: {
    pace?: string
    support_pattern?: string
    concept_example_practice_test_ratio?: string
    engagement_mode?: string
  }
  weekly_schedule?: Array<{ day: string; focus: string }>
  engagement_hooks?: string[]
  motivation_safeguards?: string[]
  scaffolding_rule?: string
  challenge_rule?: string
  units: StudyUnit[]
}

interface PlanIntake {
  foundation: string
  examTimeline: string
  targetScore: string
  weeklyHours: string
  prepMonths: string
  studyDays: string[]
  hoursPerSession: string
  weakAreas: string
  baselineConfidence: Record<string, string>
}

interface StudyPlanChatDraft {
  version: 2
  savedAt: number
  phase: WorkflowPhase
  selectedSubject: string | null
  selectedFramework: string | null
  selectedCourse: string | null
  intake: PlanIntake
  chatMessages: Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }>
  userInput: string
  chatStage: string
  proposedPlan: ProposedPlan | null
  planFeedback: string
  createdPlanId: string | null
  autoSaveStatus: 'idle' | 'saving' | 'saved'
}

const defaultIntake = (): PlanIntake => ({
  foundation: '',
  examTimeline: '',
  targetScore: '',
  weeklyHours: '6',
  prepMonths: '3',
  studyDays: [],
  hoursPerSession: '1.5',
  weakAreas: '',
  baselineConfidence: {},
})

const STUDY_DAYS = [
  { value: 'mon', zh: '一', en: 'Mon' },
  { value: 'tue', zh: '二', en: 'Tue' },
  { value: 'wed', zh: '三', en: 'Wed' },
  { value: 'thu', zh: '四', en: 'Thu' },
  { value: 'fri', zh: '五', en: 'Fri' },
  { value: 'sat', zh: '六', en: 'Sat' },
  { value: 'sun', zh: '日', en: 'Sun' },
]

function baselinePrompts(subject: string | null, course: string | null, lang: 'zh' | 'en'): string[] {
  const courseLabel = course || (lang === 'zh' ? '这门课' : 'this course')
  const generic = lang === 'zh'
    ? [
        `我能说清 ${courseLabel} 的核心概念。`,
        '我能独立完成基础题。',
        '我能看懂中等难度题目的条件。',
        '我知道自己最薄弱的章节。',
        '我能在限时环境下保持稳定。',
      ]
    : [
        `I can explain the core ideas in ${courseLabel}.`,
        'I can solve foundational problems independently.',
        'I can parse medium-difficulty prompts.',
        'I know which units are weakest.',
        'I stay steady under timed conditions.',
      ]

  if (subject === 'math') {
    return lang === 'zh'
      ? ['函数/公式变形', '概念定义', '计算准确率', '综合应用题', '限时解题'].map((x) => `我对「${x}」有把握。`)
      : ['functions/formula manipulation', 'definitions', 'calculation accuracy', 'multi-step applications', 'timed solving'].map((x) => `I feel confident with ${x}.`)
  }
  if (['physics', 'chemistry', 'biology', 'environmental_science'].includes(subject || '')) {
    return lang === 'zh'
      ? ['核心概念', '计算/数据题', '实验/图表', '大题表达', '易错点辨析'].map((x) => `我对「${x}」有把握。`)
      : ['core concepts', 'calculations/data', 'labs/graphs', 'structured responses', 'common misconceptions'].map((x) => `I feel confident with ${x}.`)
  }
  if (['history', 'english', 'economics', 'government', 'psychology', 'world_languages', 'art'].includes(subject || '')) {
    return lang === 'zh'
      ? ['核心概念', '材料/文本分析', '论证结构', '案例/证据使用', '限时写作'].map((x) => `我对「${x}」有把握。`)
      : ['core concepts', 'source/text analysis', 'argument structure', 'evidence use', 'timed writing'].map((x) => `I feel confident with ${x}.`)
  }
  return generic
}

const STUDY_PLAN_DRAFT_KEY_PREFIX = 'study-plan-chat-draft-v2'
const STUDY_PLAN_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const QUICK_QUESTION_PLAN_PREFILL_KEY = 'mm-quick-question-study-plan-prefill-v1'

function serializeChatMessages(messages: ChatMessage[]): StudyPlanChatDraft['chatMessages'] {
  return messages.map((message) => ({
    ...message,
    timestamp:
      message.timestamp instanceof Date
        ? message.timestamp.toISOString()
        : new Date(message.timestamp).toISOString(),
  }))
}

function subjectFromQuickQuestion(subject: string | undefined | null): string | null {
  const normalized = (subject || '').trim().toLowerCase()
  if (!normalized) return null
  const direct = SUBJECTS.find((item) => item.id === normalized)
  if (direct) return direct.id
  if (/(math|calculus|algebra|geometry|precalc|统计|数学|微积分|代数|几何)/i.test(normalized)) return 'math'
  if (/(physics|物理)/i.test(normalized)) return 'physics'
  if (/(chem|化学)/i.test(normalized)) return 'chemistry'
  if (/(bio|biology|生物)/i.test(normalized)) return 'biology'
  if (/(econ|economics|经济)/i.test(normalized)) return 'economics'
  return null
}

function inferQuickQuestionPlanTarget(subject: string | undefined | null): {
  subject: string | null
  framework: string
  course: string | null
} {
  const raw = (subject || '').trim()
  const normalized = raw.toLowerCase()
  const inferredSubject = subjectFromQuickQuestion(raw)
  let framework = 'general'

  if (/\b(ap|advanced placement)\b|大学先修/i.test(raw)) framework = 'ap'
  else if (/(高考|gaokao|全国卷)/i.test(raw)) framework = 'gaokao'
  else if (/\b(ib|international baccalaureate)\b/i.test(raw)) framework = 'ib'
  else if (/\b(a[-\s]?level|alevel)\b/i.test(raw)) framework = 'a_level'

  const looksCourseSpecific =
    framework !== 'general' ||
    /(calculus|statistics|physics|chemistry|biology|economics|history|psychology|computer science|微积分|统计|物理|化学|生物|经济|历史|心理)/i.test(normalized)

  return {
    subject: inferredSubject,
    framework,
    course: raw && looksCourseSpecific ? raw : null,
  }
}

async function readJsonOrThrow(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  let data: any = null

  if (contentType.includes('application/json') && text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const rawDetail = data?.detail
    const detail =
      (typeof rawDetail === 'object' && rawDetail?.error) ||
      (typeof rawDetail === 'string' && rawDetail) ||
      data?.error ||
      (response.status === 504
        ? '学习计划没有生成完成，请再试一次。'
        : text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180))

    throw new Error(typeof detail === 'string' && detail ? detail : `Request failed (${response.status})`)
  }

  if (data === null) {
    throw new Error('Server returned a non-JSON response. Please retry.')
  }

  return data
}

function makeStudyPlanRequestId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

function flattenPlanText(value: unknown, limit = 12000): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.slice(0, limit)
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => flattenPlanText(item, limit)).join(' ').slice(0, limit)
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return ['title', 'subject', 'framework', 'course_name', 'description', 'diagnostic_context', 'units']
      .map((key) => flattenPlanText(obj[key], limit))
      .join(' ')
      .slice(0, limit)
  }
  return String(value).slice(0, limit)
}

function findPlanFrameworkConflict(plan: ProposedPlan, selectedFramework: string | null, lang: 'zh' | 'en'): string | null {
  const framework = (selectedFramework || plan.framework || '').toLowerCase()
  const blob = flattenPlanText(plan).toLowerCase()
  if (framework === 'ap' && (blob.includes('高考') || blob.includes('gaokao') || blob.includes('全国卷') || blob.includes('130+'))) {
    return lang === 'zh'
      ? '这个计划混入了高考内容，但你选的是 AP。请点“修改”让 Mina 重新生成 AP-only 计划。'
      : 'This plan mixes Gaokao content into an AP plan. Use Revise and ask Mina for an AP-only plan.'
  }
  if (framework === 'gaokao' && /(^|[^a-z])ap([^a-z]|$)|advanced\s+placement|college\s+board/i.test(blob)) {
    return lang === 'zh'
      ? '这个计划混入了 AP 内容，但你选的是高考。请点“修改”让 Mina 重新生成高考-only 计划。'
      : 'This plan mixes AP content into a Gaokao plan. Use Revise and ask Mina for a Gaokao-only plan.'
  }
  if (!Array.isArray(plan.units) || plan.units.length === 0) {
    return lang === 'zh'
      ? '这个计划没有可用单元，不能保存。请让 Mina 重新生成。'
      : 'This plan has no usable units, so it cannot be saved. Ask Mina to regenerate it.'
  }
  return null
}

function findFrameworkInputConflict(
  framework: string | null,
  textParts: Array<string | null | undefined>,
  lang: 'zh' | 'en',
): string | null {
  const normalizedFramework = (framework || '').toLowerCase()
  const blob = textParts.filter(Boolean).join(' ').toLowerCase()
  if (!blob) return null

  const hasGaokaoMarker = /(高考|gaokao|全国卷|数学\s*130\+|总分\s*650\+|(?:^|[^\d])130\+(?:$|[^\d]))/i.test(blob)
  const hasApMarker = /(^|[^a-z])ap([^a-z]|$)|advanced\s+placement|college\s+board|frq|dbq/i.test(blob)

  if (normalizedFramework === 'ap' && hasGaokaoMarker) {
    return lang === 'zh'
      ? '你当前选择的是 AP，但输入里出现了高考/130+目标。请返回上一步切换到高考，或把目标改成 AP 分数（例如 5 分）。'
      : 'You selected AP, but the details mention Gaokao/130+ targets. Switch the framework to Gaokao, or use an AP target such as 5.'
  }
  if (normalizedFramework === 'gaokao' && hasApMarker) {
    return lang === 'zh'
      ? '你当前选择的是高考，但输入里出现了 AP/College Board 内容。请返回上一步切换到 AP，或删除 AP 目标。'
      : 'You selected Gaokao, but the details mention AP/College Board content. Switch the framework to AP, or remove the AP target.'
  }
  return null
}

function studyPlanCreateErrorMessage(data: any, fallbackLang: 'zh' | 'en'): string {
  const detail = data?.detail
  const code = typeof detail === 'object' ? detail.error : ''
  if (code === 'framework_conflict') {
    return fallbackLang === 'zh'
      ? '计划混入了不匹配的考试体系，已阻止保存。请点“修改”让 Mina 重新生成。'
      : 'The plan mixed incompatible exam frameworks, so it was not saved. Use Revise to regenerate.'
  }
  if (code === 'empty_study_plan') {
    return fallbackLang === 'zh'
      ? '计划没有可用单元，已阻止保存。请重新生成。'
      : 'The plan had no usable units, so it was not saved. Please regenerate it.'
  }
  if (typeof detail === 'string' && detail) return detail
  if (data?.error) return String(data.error)
  return fallbackLang === 'zh' ? '计划创建失败，请重试。' : 'Failed to create plan. Please try again.'
}

function examTimelinePlaceholder(framework: string | null, lang: 'zh' | 'en'): string {
  if (lang === 'zh') {
    if (framework === 'ap') return '例如：2026年5月 AP 考试，或还有3个月'
    if (framework === 'gaokao') return '例如：2026年6月高考，或还有3个月'
    if (framework === 'ib') return '例如：2026年5月 IB 大考，或还有3个月'
    if (framework === 'a_level') return '例如：2026年5-6月 A Level，或还有3个月'
    return '例如：2026年5月，或3个月后'
  }
  if (framework === 'ap') return 'e.g. AP exam in May 2026, or in 3 months'
  if (framework === 'gaokao') return 'e.g. Gaokao in June 2026, or in 3 months'
  if (framework === 'ib') return 'e.g. IB exams in May 2026, or in 3 months'
  if (framework === 'a_level') return 'e.g. A Level exams in May-June 2026, or in 3 months'
  return 'e.g. May 2026, or in 3 months'
}

function targetScorePlaceholder(framework: string | null, lang: 'zh' | 'en'): string {
  if (lang === 'zh') {
    if (framework === 'ap') return '例如：5分，或从3分提升到4分'
    if (framework === 'gaokao') return '例如：数学130+ / 总分650+'
    if (framework === 'ib') return '例如：HL 7分 / 总分40+'
    if (framework === 'a_level') return '例如：A* / AAB'
    return '例如：90%+ / 期末A'
  }
  if (framework === 'ap') return 'e.g. 5, or improve from 3 to 4'
  if (framework === 'gaokao') return 'e.g. Math 130+ / total 650+'
  if (framework === 'ib') return 'e.g. HL 7 / total 40+'
  if (framework === 'a_level') return 'e.g. A* / AAB'
  return 'e.g. 90%+ / final exam A'
}

// ── Message renderer (matches /create pattern) ───────────────────────────────

function AssistantMessage({ content }: { content: string }) {
  return <MathText content={content} className="leading-relaxed" />
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function StudyPlanPage() {
  const router = useRouter()
  const { language: uiLanguage } = useLanguage()
  const { getToken, user, isLoaded: authLoaded, isSignedIn, signOut } = useAuth()

  const audioInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const lang = uiLanguage === 'zh' ? 'zh' as const : 'en' as const
  const {
    contexts,
    isUploading,
    handleAudioUpload,
    handleImageUpload,
    getLastUploadErrorMessage,
    clearUploadError,
    removeContext,
    buildContextMessage,
    clearContexts,
  } = useIngestUpload(lang, { getToken, onAuthInvalid: signOut })

  const [phase, setPhase] = useState<WorkflowPhase>('selecting')
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [intake, setIntake] = useState<PlanIntake>(() => defaultIntake())

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [chatStage, setChatStage] = useState('opening')
  const [streamingContent, setStreamingContent] = useState<string | null>(null)

  const [proposedPlan, setProposedPlan] = useState<ProposedPlan | null>(null)
  const [planFeedback, setPlanFeedback] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePlanContextUpload = async (file: File | undefined, kind: 'audio' | 'image') => {
    if (!file) return
    setError(null)
    clearUploadError()
    const result = kind === 'audio'
      ? await handleAudioUpload(file)
      : await handleImageUpload(file)
    if (!result) setError(getLastUploadErrorMessage())
  }

  // Gaokao now flows through the same chat path as every other framework.
  // Standalone Gaokao tutoring lives at /gaokao (kept for bookmark continuity).

  const chatEndRef = useRef<HTMLDivElement>(null)
  const draftHydratedRef = useRef(false)
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const draftKey = `${STUDY_PLAN_DRAFT_KEY_PREFIX}:${user?.id ?? 'anonymous'}`

  // Existing plans
  const [myPlans, setMyPlans] = useState<{
    id: string; title: string; subject: string; framework: string;
    progress_percentage: number; status: string; total_units: number;
    created_at: string | null; updated_at: string | null;
  }[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [deletingPlanIds, setDeletingPlanIds] = useState<Set<string>>(new Set())

  // Fetch existing study plans
  useEffect(() => {
    if (!authLoaded) return
    if (!isSignedIn) {
      setMyPlans([])
      setPlansLoading(false)
      return
    }

    let cancelled = false
    setPlansLoading(true)

    const fetchPlans = async () => {
      try {
        const token = await getToken()
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers.Authorization = `Bearer ${token}`

        const res = await fetch('/api/backend/study-plan/my-plans', { headers })
        const data = await res.json()
        if (cancelled) return
        if (data.success && data.plans) {
          setMyPlans(data.plans)
        }
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setPlansLoading(false)
      }
    }
    fetchPlans()
    return () => {
      cancelled = true
    }
  }, [authLoaded, isSignedIn, getToken, createdPlanId])

  const deleteExistingPlan = useCallback(async (planId: string) => {
    const ok = window.confirm(
      uiLanguage === 'zh'
        ? '删除这个学习计划？30天后会自动清空。'
        : 'Delete this study plan? It will be cleared after 30 days.'
    )
    if (!ok) return
    setDeletingPlanIds((prev) => new Set(prev).add(planId))
    try {
      const token = await getToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(`/api/backend/study-plan/${planId}`, { method: 'DELETE', headers })
      if (!response.ok) throw new Error(`Delete failed (${response.status})`)
      setMyPlans((prev) => prev.filter((plan) => plan.id !== planId))
    } catch {
      setError(uiLanguage === 'zh' ? '删除失败，请重试。' : 'Delete failed. Please try again.')
    } finally {
      setDeletingPlanIds((prev) => {
        const next = new Set(prev)
        next.delete(planId)
        return next
      })
    }
  }, [getToken, uiLanguage])

  const clearStudyPlanDraft = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(draftKey)
    } catch {
      // ignore storage failures
    }
  }, [draftKey])

  const buildStudyPlanDraft = useCallback((): StudyPlanChatDraft | null => {
    if (phase === 'done') return null

    const hasDraft =
      phase !== 'selecting' ||
      Boolean(selectedSubject) ||
      Boolean(selectedFramework) ||
      chatMessages.length > 0 ||
      Boolean(userInput.trim()) ||
      Boolean(proposedPlan) ||
      Boolean(planFeedback.trim()) ||
      Boolean(createdPlanId)

    if (!hasDraft) return null

    return {
      version: 2,
      savedAt: Date.now(),
      phase: phase === 'creating' ? 'plan_review' : phase,
      selectedSubject,
      selectedFramework,
      selectedCourse,
      intake,
      chatMessages: serializeChatMessages(chatMessages),
      userInput,
      chatStage,
      proposedPlan,
      planFeedback,
      createdPlanId,
      autoSaveStatus,
    }
  }, [
    phase,
    selectedSubject,
    selectedFramework,
    selectedCourse,
    intake,
    chatMessages,
    userInput,
    chatStage,
    proposedPlan,
    planFeedback,
    createdPlanId,
    autoSaveStatus,
  ])

  const writeStudyPlanDraft = useCallback(() => {
    if (typeof window === 'undefined' || !draftHydratedRef.current) return
    const draft = buildStudyPlanDraft()
    try {
      if (!draft) {
        window.localStorage.removeItem(draftKey)
        return
      }
      window.localStorage.setItem(draftKey, JSON.stringify(draft))
    } catch (err) {
      console.warn('[study-plan/draft] save failed', err)
    }
  }, [buildStudyPlanDraft, draftKey])

  const writeStudyPlanDraftSnapshot = useCallback((draft: StudyPlanChatDraft) => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft))
    } catch (err) {
      console.warn('[study-plan/draft] save failed', err)
    }
  }, [draftKey])

  useEffect(() => {
    if (!authLoaded || typeof window === 'undefined' || draftHydratedRef.current) return
    draftHydratedRef.current = true
    try {
      const quickPrefillRaw = window.localStorage.getItem(QUICK_QUESTION_PLAN_PREFILL_KEY)
      if (quickPrefillRaw) {
        window.localStorage.removeItem(QUICK_QUESTION_PLAN_PREFILL_KEY)
        const quickPrefill = JSON.parse(quickPrefillRaw) as {
          savedAt?: number
          language?: string
          subject?: string
          question?: string
          context?: string
          uploadedContext?: string | null
          answer?: string
        }
        if (!quickPrefill.savedAt || Date.now() - quickPrefill.savedAt <= STUDY_PLAN_DRAFT_MAX_AGE_MS) {
          const inferredTarget = inferQuickQuestionPlanTarget(quickPrefill.subject)
          const quickLabels = uiLanguage === 'zh'
            ? {
                subject: '科目/课程',
                question: '题目',
                context: '补充材料',
                answer: 'Mina 的解答',
              }
            : {
                subject: 'Subject/course',
                question: 'Question',
                context: 'Context',
                answer: "Mina's answer",
              }
          const prompt = uiLanguage === 'zh'
            ? '请把这个单题暴露出的知识点和薄弱环节，扩展成一个短期学习计划。'
            : 'Turn the knowledge gaps exposed by this one question into a short study plan.'
          const quickMessages: ChatMessage[] = [
            {
              id: 'quick_question_source',
              role: 'user',
              content: [
                quickPrefill.subject ? `${quickLabels.subject}: ${quickPrefill.subject}` : null,
                quickPrefill.question ? `${quickLabels.question}:\n${quickPrefill.question}` : null,
                quickPrefill.context ? `${quickLabels.context}:\n${quickPrefill.context}` : null,
                quickPrefill.uploadedContext || null,
                quickPrefill.answer ? `${quickLabels.answer}:\n${quickPrefill.answer}` : null,
              ].filter(Boolean).join('\n\n'),
              timestamp: new Date(),
            },
            {
              id: 'quick_question_plan_prompt',
              role: 'assistant',
              content: uiLanguage === 'zh'
                ? '我已经带入这道题、你的补充材料和刚才的解答。你可以直接让我生成计划，或补充考试时间、目标分数和每周学习时间。'
                : 'I brought over the question, your extra materials, and Mina’s answer. You can ask me to generate the plan now, or add exam timing, target score, and weekly study time.',
              timestamp: new Date(),
            },
          ]
          const quickIntake = {
            ...defaultIntake(),
            weakAreas: quickPrefill.question || '',
          }
          setPhase('chatting')
          setSelectedSubject(inferredTarget.subject)
          setSelectedFramework(inferredTarget.framework)
          setSelectedCourse(inferredTarget.course)
          setIntake(quickIntake)
          setChatMessages(quickMessages)
          setUserInput(prompt)
          setChatStage('diagnostic')
          setProposedPlan(null)
          setPlanFeedback('')
          setCreatedPlanId(null)
          setAutoSaveStatus('idle')
          setIsTyping(false)
          setStreamingContent(null)
          setError(null)
          writeStudyPlanDraftSnapshot({
            version: 2,
            savedAt: Date.now(),
            phase: 'chatting',
            selectedSubject: inferredTarget.subject,
            selectedFramework: inferredTarget.framework,
            selectedCourse: inferredTarget.course,
            intake: quickIntake,
            chatMessages: serializeChatMessages(quickMessages),
            userInput: prompt,
            chatStage: 'diagnostic',
            proposedPlan: null,
            planFeedback: '',
            createdPlanId: null,
            autoSaveStatus: 'idle',
          })
          return
        }
      }

      const raw = window.localStorage.getItem(draftKey)
      if (!raw) return
      const draft = JSON.parse(raw) as StudyPlanChatDraft
      if (!draft || draft.version !== 2 || typeof draft.savedAt !== 'number') return
      if (Date.now() - draft.savedAt > STUDY_PLAN_DRAFT_MAX_AGE_MS) {
        window.localStorage.removeItem(draftKey)
        return
      }
      const restoredMessages = Array.isArray(draft.chatMessages)
        ? draft.chatMessages.map((message) => ({
            ...message,
            timestamp: new Date(message.timestamp),
          }))
        : []
      setPhase(draft.phase || 'selecting')
      setSelectedSubject(draft.selectedSubject ?? null)
      setSelectedFramework(draft.selectedFramework ?? null)
      setSelectedCourse(draft.selectedCourse ?? null)
      setIntake(draft.intake ?? defaultIntake())
      setChatMessages(restoredMessages)
      setUserInput(draft.userInput ?? '')
      setChatStage(draft.chatStage || 'opening')
      setProposedPlan(draft.proposedPlan ?? null)
      setPlanFeedback(draft.planFeedback ?? '')
      setCreatedPlanId(draft.createdPlanId ?? null)
      setAutoSaveStatus(draft.autoSaveStatus === 'saved' ? 'saved' : 'idle')
      setIsTyping(false)
      setStreamingContent(null)
      setError(null)
    } catch (err) {
      console.warn('[study-plan/draft] restore failed', err)
    }
  }, [authLoaded, draftKey, uiLanguage, writeStudyPlanDraftSnapshot])

  useEffect(() => {
    if (!draftHydratedRef.current || typeof window === 'undefined') return
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    draftSaveTimerRef.current = setTimeout(writeStudyPlanDraft, 250)
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current)
    }
  }, [writeStudyPlanDraft])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const flush = () => writeStudyPlanDraft()
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flushWhenHidden)
    }
  }, [writeStudyPlanDraft])

  // Auto-scroll on new messages or streaming updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingContent])

  // Warn before leaving if there's unsaved work
  useEffect(() => {
    const hasUnsavedWork =
      (phase === 'chatting' && chatMessages.length > 1) ||
      (phase === 'plan_review' && proposedPlan !== null)

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedWork) {
        e.preventDefault()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [phase, chatMessages.length, proposedPlan])

  // ── Subject/Framework Selection ──────────────────────────────────────────

  const handleSubjectSelect = (subjectId: string) => {
    setSelectedSubject(subjectId)
    setSelectedCourse(null)
  }

  const handleFrameworkSelect = (frameworkId: string) => {
    setSelectedFramework(frameworkId)
    setSelectedCourse(null)
  }

  const handleContinueToIntake = (courseName?: string) => {
    if (!selectedFramework || !selectedSubject) return
    if (courseName) setSelectedCourse(courseName)
    setPhase('intake')
  }

  const toggleStudyDay = (day: string) => {
    setIntake((prev) => {
      const exists = prev.studyDays.includes(day)
      const nextDays = exists
        ? prev.studyDays.filter((item) => item !== day)
        : [...prev.studyDays, day]
      return { ...prev, studyDays: nextDays }
    })
  }

  const buildIntakeSummary = () => {
    const subject = SUBJECTS.find((s) => s.id === selectedSubject)
    const framework = FRAMEWORKS.find((f) => f.id === selectedFramework)
    const course = selectedCourse || (uiLanguage === 'zh' ? '未指定具体课程' : 'No exact course selected')
    const days = intake.studyDays
      .map((day) => STUDY_DAYS.find((item) => item.value === day))
      .filter(Boolean)
      .map((day) => uiLanguage === 'zh' ? `周${day?.zh}` : day?.en)
      .join(', ')
    const daySummary = days || (uiLanguage === 'zh' ? '未选择' : 'Not selected')
    const baseline = baselinePrompts(selectedSubject, selectedCourse, uiLanguage === 'zh' ? 'zh' : 'en')
      .map((prompt) => `${prompt}: ${intake.baselineConfidence[prompt] || (uiLanguage === 'zh' ? '未填写' : 'not answered')}`)
      .join('\n')

    if (uiLanguage === 'zh') {
      return [
        `我想制定学习计划。`,
        `课程体系：${framework?.labelZh ?? selectedFramework}`,
        `科目：${subject?.labelZh ?? selectedSubject}`,
        `具体课程：${course}`,
        `当前基础：${intake.foundation || '未填写'}`,
        `考试/目标时间：${intake.examTimeline || '未填写'}`,
        `目标分数：${intake.targetScore || '未填写'}`,
        `每周学习时间：${intake.weeklyHours} 小时`,
        `总准备周期：${intake.prepMonths} 个月`,
        `学习安排：${daySummary}，每次 ${intake.hoursPerSession} 小时`,
        `薄弱点/补充需求：${intake.weakAreas || '未填写'}`,
        `基线自测：\n${baseline}`,
        `请先判断信息是否足够；如果足够，请生成完整学习计划；如果缺关键信息，只问一个最重要的问题。`,
      ].join('\n')
    }

    return [
      `I want to build a study plan.`,
      `Framework: ${framework?.label ?? selectedFramework}`,
      `Subject: ${subject?.label ?? selectedSubject}`,
      `Course: ${course}`,
      `Current foundation: ${intake.foundation || 'not provided'}`,
      `Exam/goal timeline: ${intake.examTimeline || 'not provided'}`,
      `Target score: ${intake.targetScore || 'not provided'}`,
      `Weekly study time: ${intake.weeklyHours} hours`,
      `Total preparation window: ${intake.prepMonths} months`,
      `Schedule: ${daySummary}, ${intake.hoursPerSession} hours per session`,
      `Weak areas/context: ${intake.weakAreas || 'not provided'}`,
      `Baseline self-check:\n${baseline}`,
      `If this is enough, generate the plan. If a key detail is missing, ask only one important follow-up question.`,
    ].join('\n')
  }

  const sendChatTurn = async ({
    baseMessages,
    content,
    stage,
    mode,
    contextMsg = '',
  }: {
    baseMessages: ChatMessage[]
    content: string
    stage: string
    mode: 'typed' | 'chip' | 'intake'
    contextMsg?: string
  }) => {
    if (!content.trim()) return

    const fullContent = contextMsg ? `${contextMsg}\n\n---\n${content}` : content
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: fullContent,
      timestamp: new Date(),
    }
    const nextMessages = [...baseMessages, userMessage]

    setChatMessages(nextMessages)
    setUserInput('')
    writeStudyPlanDraftSnapshot({
      version: 2,
      savedAt: Date.now(),
      phase: 'chatting',
      selectedSubject,
      selectedFramework,
      selectedCourse,
      intake,
      chatMessages: serializeChatMessages(nextMessages),
      userInput: '',
      chatStage: stage,
      proposedPlan,
      planFeedback,
      createdPlanId,
      autoSaveStatus,
    })
    setIsTyping(true)
    setError(null)

    if (contextMsg) clearContexts()

    const chatStartedAt = Date.now()
    const requestId = makeStudyPlanRequestId()
    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      console.info('[study-plan/chat] send', {
        requestId,
        mode,
        stage,
        subject: selectedSubject,
        framework: selectedFramework,
      })
      const response = await fetch('/api/backend/study-plan/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          history: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          stage,
          request_id: requestId,
          subject: selectedSubject,
          framework: selectedFramework,
          course: selectedCourse,
          language: uiLanguage === 'zh' ? 'zh' : 'en',
        }),
      })

      const data = await readJsonOrThrow(response)
      const responseStage = typeof data?.stage === 'string' ? data.stage : stage
      console.info('[study-plan/chat] response', {
        requestId,
        mode,
        stage: responseStage,
        source: data?.response_source ?? 'unknown',
        hasPlan: Boolean(data?.proposed_plan),
      })
      try {
        track(
          'study_plan_chat_rtt',
          {
            phase: responseStage,
            source: data?.response_source ?? 'unknown',
            mode,
          },
          { latency_ms: Date.now() - chatStartedAt },
        )
      } catch {
        // swallow
      }

      if (data.success || data.content) {
        if (data.stage) setChatStage(data.stage)

        const words = ((data.content ?? '') as string).split(' ')
        setStreamingContent('')
        let built = ''
        for (let i = 0; i < words.length; i++) {
          built += (i === 0 ? '' : ' ') + words[i]
          setStreamingContent(built)
          await new Promise((r) => setTimeout(r, 28))
        }
        setStreamingContent(null)

        const aiResponse: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.content ?? '',
          timestamp: new Date(),
          options: Array.isArray(data.options) && data.options.length > 0 ? data.options : undefined,
          allowFreeText: data.allow_free_text !== false,
        }
        const finalMessages = [...nextMessages, aiResponse]
        setChatMessages(finalMessages)

        if (data.proposed_plan) {
          setProposedPlan(data.proposed_plan)
          setPhase('plan_review')
        }
        writeStudyPlanDraftSnapshot({
          version: 2,
          savedAt: Date.now(),
          phase: data.proposed_plan ? 'plan_review' : 'chatting',
          selectedSubject,
          selectedFramework,
          selectedCourse,
          intake,
          chatMessages: serializeChatMessages(finalMessages),
          userInput: '',
          chatStage: responseStage,
          proposedPlan: data.proposed_plan ?? proposedPlan,
          planFeedback,
          createdPlanId,
          autoSaveStatus,
        })
      } else {
        setError(
          uiLanguage === 'zh'
            ? '获取回复失败，请重试。'
            : 'Failed to get a response. Please try again.'
        )
      }
    } catch (err) {
      console.error('Study plan chat error:', err)
      const fallback =
        uiLanguage === 'zh'
          ? '网络错误，请检查连接后重试。'
          : 'Network error. Please check your connection and try again.'
      setError(
        err instanceof Error && err.message ? err.message : fallback
      )
    } finally {
      setIsTyping(false)
    }
  }

  const startChatFromIntake = () => {
    if (intake.studyDays.length === 0) {
      setError(uiLanguage === 'zh' ? '请至少选择一个每周学习日。' : 'Choose at least one study day.')
      return
    }
    const inputConflict = findFrameworkInputConflict(
      selectedFramework,
      [
        selectedCourse,
        intake.foundation,
        intake.examTimeline,
        intake.targetScore,
        intake.weakAreas,
      ],
      uiLanguage === 'zh' ? 'zh' : 'en',
    )
    if (inputConflict) {
      setError(inputConflict)
      return
    }
    const subject = SUBJECTS.find((s) => s.id === selectedSubject)
    const framework = FRAMEWORKS.find((f) => f.id === selectedFramework)
    const assistantName = 'Mina'
    const openingMessage: ChatMessage = {
      id: 'opening_1',
      role: 'assistant',
      content:
        uiLanguage === 'zh'
          ? `你好，我是 ${assistantName}。我已经整理好你的 ${subject?.labelZh ?? ''} ${framework?.labelZh ?? ''} 背景，会用这些信息帮你生成计划。`
          : `Hi, I'm ${assistantName}. I have your ${subject?.label ?? ''} ${framework?.label ?? ''} context and will use it to build the plan.`,
      timestamp: new Date(),
    }
    const summary = buildIntakeSummary()
    const userMessage: ChatMessage = {
      id: 'intake_summary',
      role: 'user',
      content: summary,
      timestamp: new Date(),
    }
    const messages = [openingMessage, userMessage]
    const prompt = uiLanguage === 'zh' ? '请根据以上信息生成学习计划。' : 'Please generate the study plan from the context above.'
    setChatMessages(messages)
    setUserInput('')
    setChatStage('diagnostic')
    setPhase('chatting')
    writeStudyPlanDraftSnapshot({
      version: 2,
      savedAt: Date.now(),
      phase: 'chatting',
      selectedSubject,
      selectedFramework,
      selectedCourse,
      intake,
      chatMessages: serializeChatMessages(messages),
      userInput: '',
      chatStage: 'diagnostic',
      proposedPlan: null,
      planFeedback: '',
      createdPlanId: null,
      autoSaveStatus: 'idle',
    })
    void sendChatTurn({
      baseMessages: messages,
      content: prompt,
      stage: 'diagnostic',
      mode: 'intake',
    })
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  const handleSendMessage = async () => {
    if (!userInput.trim()) return

    const contextMsg = buildContextMessage()
    const fullContent = contextMsg ? `${contextMsg}\n\n---\n${userInput}` : userInput

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: fullContent,
      timestamp: new Date(),
    }

    setChatMessages((prev) => [...prev, userMessage])
    setUserInput('')
    writeStudyPlanDraftSnapshot({
      version: 2,
      savedAt: Date.now(),
      phase: 'chatting',
      selectedSubject,
      selectedFramework,
      selectedCourse,
      intake,
      chatMessages: serializeChatMessages([...chatMessages, userMessage]),
      userInput: '',
      chatStage,
      proposedPlan,
      planFeedback,
      createdPlanId,
      autoSaveStatus,
    })
    setIsTyping(true)
    setError(null)

    if (contextMsg) clearContexts()

    const chatStartedAt = Date.now()
    const requestId = makeStudyPlanRequestId()
    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      console.info('[study-plan/chat] send', {
        requestId,
        mode: 'typed',
        stage: chatStage,
        subject: selectedSubject,
        framework: selectedFramework,
      })
      const response = await fetch('/api/backend/study-plan/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          history: [...chatMessages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stage: chatStage,
          request_id: requestId,
          subject: selectedSubject,
          framework: selectedFramework,
          course: selectedCourse,
          language: uiLanguage === 'zh' ? 'zh' : 'en',
        }),
      })

      const data = await readJsonOrThrow(response)
      console.info('[study-plan/chat] response', {
        requestId,
        mode: 'typed',
        stage: data?.stage ?? chatStage,
        source: data?.response_source ?? 'unknown',
        hasPlan: Boolean(data?.proposed_plan),
      })
      try {
        track(
          'study_plan_chat_rtt',
          {
            phase: typeof data?.stage === 'string' ? data.stage : chatStage,
            source: data?.response_source ?? 'unknown',
            mode: 'typed',
          },
          { latency_ms: Date.now() - chatStartedAt },
        )
      } catch {
        // swallow
      }

      if (data.success || data.content) {
        if (data.stage) setChatStage(data.stage)

        // Stream the response word by word (matches /create pattern)
        const words = ((data.content ?? '') as string).split(' ')
        setStreamingContent('')
        let built = ''
        for (let i = 0; i < words.length; i++) {
          built += (i === 0 ? '' : ' ') + words[i]
          setStreamingContent(built)
          await new Promise((r) => setTimeout(r, 28))
        }
        setStreamingContent(null)

        const aiResponse: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.content ?? '',
          timestamp: new Date(),
          options: Array.isArray(data.options) && data.options.length > 0 ? data.options : undefined,
          allowFreeText: data.allow_free_text !== false,
        }
        setChatMessages((prev) => [...prev, aiResponse])

        // Transition to plan review when backend returns a proposed plan
        if (data.proposed_plan) {
          setProposedPlan(data.proposed_plan)
          setPhase('plan_review')
        }
      } else {
        setError(
          uiLanguage === 'zh'
            ? '获取回复失败，请重试。'
            : 'Failed to get a response. Please try again.'
        )
      }
    } catch (err) {
      console.error('Study plan chat error:', err)
      const fallback =
        uiLanguage === 'zh'
          ? '网络错误，请检查连接后重试。'
          : 'Network error. Please check your connection and try again.'
      setError(
        err instanceof Error && err.message ? err.message : fallback
      )
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // ── Quick-reply chip click → send the chip text as user message ─────────
  const handleChipClick = (option: string) => {
    if (isTyping) return
    setUserInput(option)
    // Defer so React updates the textarea value before send
    setTimeout(() => {
      setUserInput('')
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: option,
        timestamp: new Date(),
      }
      setChatMessages((prev) => [...prev, userMessage])
      writeStudyPlanDraftSnapshot({
        version: 2,
        savedAt: Date.now(),
        phase: 'chatting',
        selectedSubject,
        selectedFramework,
        selectedCourse,
        intake,
        chatMessages: serializeChatMessages([...chatMessages, userMessage]),
        userInput: '',
        chatStage,
        proposedPlan,
        planFeedback,
        createdPlanId,
        autoSaveStatus,
      })
      // Mirror handleSendMessage but use the option directly
      void (async () => {
        setIsTyping(true)
        setError(null)
        const chipStartedAt = Date.now()
        const requestId = makeStudyPlanRequestId()
        try {
          const token = await getToken()
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (token) headers.Authorization = `Bearer ${token}`
          console.info('[study-plan/chat] send', {
            requestId,
            mode: 'chip',
            stage: chatStage,
            subject: selectedSubject,
            framework: selectedFramework,
            option,
          })
          const response = await fetch('/api/backend/study-plan/chat', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              history: [...chatMessages, userMessage].map((m) => ({ role: m.role, content: m.content })),
              stage: chatStage,
              request_id: requestId,
              subject: selectedSubject,
              framework: selectedFramework,
              course: selectedCourse,
              language: uiLanguage === 'zh' ? 'zh' : 'en',
            }),
          })
          const data = await readJsonOrThrow(response)
          console.info('[study-plan/chat] response', {
            requestId,
            mode: 'chip',
            stage: data?.stage ?? chatStage,
            source: data?.response_source ?? 'unknown',
            hasPlan: Boolean(data?.proposed_plan),
          })
          try {
            track(
              'study_plan_chat_rtt',
              {
                phase: typeof data?.stage === 'string' ? data.stage : chatStage,
                source: data?.response_source ?? 'unknown',
                mode: 'chip',
              },
              { latency_ms: Date.now() - chipStartedAt },
            )
          } catch {
            // swallow
          }
          if (data.success || data.content) {
            if (data.stage) setChatStage(data.stage)
            const aiResponse: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: data.content ?? '',
              timestamp: new Date(),
              options: Array.isArray(data.options) && data.options.length > 0 ? data.options : undefined,
              allowFreeText: data.allow_free_text !== false,
            }
            setChatMessages((prev) => [...prev, aiResponse])
            if (data.proposed_plan) {
              setProposedPlan(data.proposed_plan)
              setPhase('plan_review')
            }
          }
        } catch (err) {
          console.error('Chip click chat error:', err)
          const fallback =
            uiLanguage === 'zh'
              ? '网络错误，请检查连接后重试。'
              : 'Network error. Please check your connection and try again.'
          setError(err instanceof Error && err.message ? err.message : fallback)
        } finally {
          setIsTyping(false)
        }
      })()
    }, 0)
  }

  // ── Plan review ───────────────────────────────────────────────────────────

  const handleRequestChanges = () => {
    const feedbackMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content:
        planFeedback.trim() ||
        (uiLanguage === 'zh' ? '我想调整一下计划。' : 'I would like to make some changes.'),
      timestamp: new Date(),
    }
    setChatMessages((prev) => [...prev, feedbackMessage])
    setPlanFeedback('')
    setProposedPlan(null)
    setCreatedPlanId(null)
    setAutoSaveStatus('idle')
    setPhase('chatting')
    // handleSendMessage will handle the next turn
    setUserInput(feedbackMessage.content)
  }

  const handleConfirmPlan = async () => {
    if (!proposedPlan) return
    const localValidationError = findPlanFrameworkConflict(proposedPlan, selectedFramework, uiLanguage === 'zh' ? 'zh' : 'en')
    if (localValidationError) {
      setError(localValidationError)
      setPhase('plan_review')
      return
    }

    // If auto-save already created the plan, just navigate
    if (createdPlanId) {
      setPhase('done')
      clearStudyPlanDraft()
      router.push(`/study-plan/${createdPlanId}`)
      return
    }

    setIsCreating(true)
    setPhase('creating')
    setError(null)

    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const response = await fetch('/api/backend/study-plan/create', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          plan_data: {
            ...proposedPlan,
            subject: selectedSubject || proposedPlan.subject,
            framework: selectedFramework || proposedPlan.framework,
            course_name: selectedCourse || proposedPlan.course_name,
            diagnostic_context: {
              intake,
              selected_course: selectedCourse,
              assistant_name: 'Mina',
            },
          },
          language: uiLanguage === 'zh' ? 'zh' : 'en',
        }),
      })

      const data = await response.json()

      if (data.success && data.plan_id) {
        setCreatedPlanId(data.plan_id)
        setPhase('done')
        clearStudyPlanDraft()
        router.push(`/study-plan/${data.plan_id}`)
      } else if (data.plan_id) {
        setCreatedPlanId(data.plan_id)
        setPhase('done')
        clearStudyPlanDraft()
        router.push(`/study-plan/${data.plan_id}`)
      } else {
        setError(studyPlanCreateErrorMessage(data, uiLanguage === 'zh' ? 'zh' : 'en'))
        setPhase('plan_review')
      }
    } catch (err) {
      console.error('Study plan create error:', err)
      setError(
        uiLanguage === 'zh'
          ? '网络错误，计划保存失败。'
          : 'Network error. Failed to save plan.'
      )
      setPhase('plan_review')
    } finally {
      setIsCreating(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const latestOptionMessageId = [...chatMessages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.options && message.options.length > 0)?.id
  const planReviewValidationError = proposedPlan
    ? findPlanFrameworkConflict(proposedPlan, selectedFramework, uiLanguage === 'zh' ? 'zh' : 'en')
    : null
  const shouldShowPlannerWorkflow = authLoaded && (!isSignedIn || !plansLoading || myPlans.length > 0)

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow={uiLanguage === 'zh' ? '学习计划' : 'Study plan'}
        title={uiLanguage === 'zh' ? '你的学习计划' : 'Your study plan'}
        kicker={
          uiLanguage === 'zh'
            ? '查看已有计划，或与 Mina 创建新的学习计划。'
            : 'View your existing plans or build a new one with Mina.'
        }
      />

      {/* ── MY STUDY PLANS ────────────────────────────────────────────────── */}
      {myPlans.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {uiLanguage === 'zh' ? '我的学习计划' : 'My Study Plans'}
            </h2>
            <span className="text-sm text-gray-500">
              {myPlans.length} {uiLanguage === 'zh' ? '个计划' : myPlans.length === 1 ? 'plan' : 'plans'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {myPlans.map((p) => {
              const subjectObj = SUBJECTS.find(s => s.id === p.subject)
              const frameworkObj = FRAMEWORKS.find(f => f.id === p.framework)
              return (
                <div
                  key={p.id}
                  className="group relative"
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/study-plan/${p.id}`)}
                    className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-5 text-left hover:border-blue-300 hover:shadow-md transition-all"
                    aria-label={
                      uiLanguage === 'zh'
                        ? `打开学习计划：${p.title}`
                        : `Open study plan: ${p.title}`
                    }
                  >
                  <div className="flex items-start justify-between gap-3 pr-10 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xl">{subjectObj?.icon ?? '📚'}</span>
                      <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                        {p.title}
                      </h3>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                      p.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : p.status === 'active'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {p.status === 'completed'
                        ? uiLanguage === 'zh' ? '已完成' : 'Completed'
                        : p.status === 'active'
                        ? uiLanguage === 'zh' ? '进行中' : 'Active'
                        : p.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    <span>{uiLanguage === 'zh' ? subjectObj?.labelZh : subjectObj?.label}</span>
                    <span>·</span>
                    <span>{uiLanguage === 'zh' ? frameworkObj?.labelZh : frameworkObj?.label}</span>
                    <span>·</span>
                    <span>{p.total_units} {uiLanguage === 'zh' ? '单元' : 'units'}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{uiLanguage === 'zh' ? '进度' : 'Progress'}</span>
                      <span className="font-medium text-gray-700">{Math.round(p.progress_percentage)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all duration-500"
                        style={{ width: `${p.progress_percentage}%` }}
                      />
                    </div>
                  </div>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void deleteExistingPlan(p.id)
                    }}
                    disabled={deletingPlanIds.has(p.id)}
                    className="absolute right-4 top-4 rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                    title={uiLanguage === 'zh' ? '删除' : 'Delete'}
                    aria-label={
                      uiLanguage === 'zh'
                        ? `删除学习计划：${p.title}`
                        : `Delete study plan: ${p.title}`
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {plansLoading && myPlans.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
              <div className="h-1.5 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      )}

      {shouldShowPlannerWorkflow && phase === 'selecting' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
              <BookOpen size={20} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">
                {uiLanguage === 'zh' ? '生成学习计划' : 'Build a study plan'}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-gray-500">
                {uiLanguage === 'zh'
                  ? '适合 AP、IB、A Level、高考等长期备考。'
                  : 'For AP, IB, A Level, Gaokao, and longer exam prep.'}
              </span>
            </span>
          </button>
          <Link
            href="/ask"
            className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-300"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
              <HelpCircle size={20} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-gray-900">
                {uiLanguage === 'zh' ? '只问一道题' : 'Ask one question'}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-gray-500">
                {uiLanguage === 'zh'
                  ? '不用生成计划，直接上传题目或描述问题。'
                  : 'Skip planning and go straight to a problem or concept.'}
              </span>
            </span>
          </Link>
        </div>
      )}

      {/* ── CREATE NEW PLAN ───────────────────────────────────────────────── */}
      {shouldShowPlannerWorkflow && myPlans.length > 0 && phase === 'selecting' && (
        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            {uiLanguage === 'zh' ? '创建新计划' : 'Create New Plan'}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {uiLanguage === 'zh'
              ? '选择科目和框架，让 Mina 制定专属学习计划。'
              : 'Choose a subject and framework, then let Mina build your personalized plan.'}
          </p>
        </div>
      )}

      {/* Phase indicator (unified for every framework, including Gaokao) */}
      {shouldShowPlannerWorkflow && (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { key: 'selecting', label: uiLanguage === 'zh' ? '1. 选择科目' : '1. Select' },
          { key: 'intake', label: uiLanguage === 'zh' ? '2. 学习画像' : '2. Profile' },
          { key: 'chatting', label: uiLanguage === 'zh' ? '3. Mina 确认' : '3. Mina' },
          { key: 'plan_review', label: uiLanguage === 'zh' ? '4. 确认计划' : '4. Review' },
          { key: 'creating', label: uiLanguage === 'zh' ? '5. 保存' : '5. Save' },
        ].map((step) => (
          <div
            key={step.key}
            className={`rounded-xl border px-3 py-2 text-sm font-medium text-center ${
              phase === step.key ||
              (step.key === 'creating' && phase === 'done') ||
              (step.key === 'done' && phase === 'done')
                ? 'border-blue-300 bg-blue-50 text-blue-900'
                : 'border-gray-200 bg-white text-gray-500'
            }`}
          >
            {step.label}
          </div>
        ))}
      </div>
      )}

      {/* ── SELECTING PHASE ─────────────────────────────────────────────────── */}
      {shouldShowPlannerWorkflow && phase === 'selecting' && (
        <div className="space-y-8">
          {/* Framework picker — always visible. Each card has its own icon + accent
              so Gaokao / IB / A-Level read as distinct modules from the start. */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">
              {uiLanguage === 'zh' ? '选择考试框架' : 'Choose an Exam Framework'}
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              {uiLanguage === 'zh'
                ? '每个框架都有独立的考纲与单元结构。'
                : 'Each framework brings its own syllabus and unit structure.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {FRAMEWORKS.map((framework) => {
                const isActive = selectedFramework === framework.id
                // Count is total across all subjects when no subject picked yet
                const totalCourses = selectedSubject
                  ? getCourseSuggestions(framework.id, selectedSubject).length
                  : Object.values(
                      ({} as Record<string, never>),
                    ).length // placeholder, see below
                const subjectsCovered = (() => {
                  // Number of subjects this framework has at least 1 course for
                  // (helps users understand the scope of each module).
                  let n = 0
                  for (const s of SUBJECTS) {
                    if (getCourseSuggestions(framework.id, s.id).length > 0) n++
                  }
                  return n
                })()
                return (
                  <button
                    key={framework.id}
                    onClick={() => handleFrameworkSelect(framework.id)}
                    className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all hover:shadow-sm ${
                      isActive
                        ? `${framework.borderClass} ${framework.bgClass} shadow-sm`
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div
                      className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                        isActive ? framework.bgClass : 'bg-gray-100'
                      }`}
                      aria-hidden
                    >
                      {framework.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${isActive ? framework.textClass : 'text-gray-900'}`}>
                          {uiLanguage === 'zh' ? framework.labelZh : framework.label}
                        </span>
                        {selectedSubject && totalCourses > 0 && (
                          <span className="text-[10px] uppercase tracking-wide bg-white text-gray-600 rounded-full px-2 py-0.5 border border-gray-200">
                            {totalCourses} {uiLanguage === 'zh' ? '门课' : totalCourses === 1 ? 'course' : 'courses'}
                          </span>
                        )}
                        {!selectedSubject && subjectsCovered > 0 && (
                          <span className="text-[10px] uppercase tracking-wide bg-white text-gray-600 rounded-full px-2 py-0.5 border border-gray-200">
                            {subjectsCovered} {uiLanguage === 'zh' ? '科目' : subjectsCovered === 1 ? 'subject' : 'subjects'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 leading-snug">
                        {uiLanguage === 'zh' ? framework.taglineZh : framework.taglineEn}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Subject grid — supported subjects highlighted once framework is picked. */}
          {selectedFramework && (
            <div className="animate-in fade-in duration-300">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                {uiLanguage === 'zh' ? '选择科目' : 'Choose a Subject'}
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                {uiLanguage === 'zh'
                  ? `加亮的科目在 ${getFramework(selectedFramework)?.labelZh ?? ''} 框架下有官方课程，其他科目可走通用规划。`
                  : `Highlighted subjects have official courses under ${getFramework(selectedFramework)?.label ?? ''}; the rest fall back to general planning.`}
              </p>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                {uiLanguage === 'zh' ? '理工科' : 'STEM'}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-4">
                {SUBJECTS.filter((s) => s.category === 'stem').map((subject) => {
                  const supported = getCourseSuggestions(selectedFramework, subject.id).length > 0
                  const isActive = selectedSubject === subject.id
                  return (
                    <button
                      key={subject.id}
                      onClick={() => handleSubjectSelect(subject.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:shadow-sm ${
                        isActive
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : supported
                            ? 'border-gray-200 bg-white hover:border-blue-400'
                            : 'border-gray-100 bg-gray-50 opacity-60 hover:opacity-90'
                      }`}
                    >
                      <span className="text-2xl">{subject.icon}</span>
                      <span className="text-xs font-medium text-gray-800 text-center leading-tight">
                        {uiLanguage === 'zh' ? subject.labelZh : subject.label}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                {uiLanguage === 'zh' ? '人文社科' : 'Humanities & Social Sciences'}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
                {SUBJECTS.filter((s) => s.category === 'humanities').map((subject) => {
                  const supported = getCourseSuggestions(selectedFramework, subject.id).length > 0
                  const isActive = selectedSubject === subject.id
                  return (
                    <button
                      key={subject.id}
                      onClick={() => handleSubjectSelect(subject.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all hover:shadow-sm ${
                        isActive
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : supported
                            ? 'border-gray-200 bg-white hover:border-blue-400'
                            : 'border-gray-100 bg-gray-50 opacity-60 hover:opacity-90'
                      }`}
                    >
                      <span className="text-2xl">{subject.icon}</span>
                      <span className="text-xs font-medium text-gray-800 text-center leading-tight">
                        {uiLanguage === 'zh' ? subject.labelZh : subject.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Subject grid (no framework picked yet) — gentle prompt */}
          {!selectedFramework && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-xs text-gray-500">
              {uiLanguage === 'zh'
                ? '先选一个考试框架，再选科目。'
                : 'Pick a framework first; then choose a subject.'}
            </div>
          )}

          {/* Suggested courses + Continue CTA — visible once both framework and subject are picked. */}
          {selectedFramework && selectedSubject && (() => {
            const courses = getCourseSuggestions(selectedFramework, selectedSubject)
            const fw = getFramework(selectedFramework)
            const fwLabel = uiLanguage === 'zh' ? fw?.labelZh : fw?.label
            return (
              <div className={`rounded-xl border ${fw?.borderClass ?? 'border-gray-200'} ${fw?.bgClass ?? 'bg-gray-50'} p-4 space-y-3 animate-in fade-in duration-300`}>
                {courses.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold uppercase tracking-wide ${fw?.textClass ?? 'text-gray-700'}`}>
                        {uiLanguage === 'zh' ? '推荐课程' : 'Suggested courses'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {uiLanguage === 'zh' ? '点击直接以该课程为目标开始学习计划' : 'Tap to start the plan anchored to that course'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {courses.map((course, ci) => {
                        const display = uiLanguage === 'zh' && course.nameZh ? course.nameZh : course.name
                        return (
                          <button
                            key={ci}
                            type="button"
                            onClick={() => {
                              setSelectedCourse(course.name)
                              handleContinueToIntake(course.name)
                            }}
                            className={`rounded-full border ${fw?.borderClass ?? 'border-gray-300'} bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-medium ${fw?.textClass ?? 'text-gray-800'}`}
                          >
                            {display}
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <div className={`text-xs ${fw?.textClass ?? 'text-gray-700'}`}>
                    {uiLanguage === 'zh'
                      ? `${fwLabel} 框架下暂无该科目的官方课程，AI 会按通用大纲为你规划。`
                      : `No official ${fwLabel} course is catalogued for this subject yet — the AI will plan from a general syllabus.`}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleContinueToIntake()}
                  className={`w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 transition-colors`}
                >
                  {uiLanguage === 'zh'
                    ? `开始 ${fwLabel} 学习计划 →`
                    : `Continue to ${fwLabel} plan →`}
                </button>
              </div>
            )
          })()}
        </div>
      )}

      {/* ── INTAKE PHASE ──────────────────────────────────────────────────── */}
      {shouldShowPlannerWorkflow && phase === 'intake' && (
        <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {uiLanguage === 'zh' ? '先建立学习画像' : 'Build your learner profile'}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {uiLanguage === 'zh'
                  ? 'Mina 会用这些答案决定讲概念、串讲复习和刷题训练的比例。'
                  : 'Mina uses this to balance concepts, review, and practice.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPhase('selecting')}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {uiLanguage === 'zh' ? '← 返回' : '← Back'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {uiLanguage === 'zh' ? '当前基础' : 'Current foundation'}
              </span>
              <select
                value={intake.foundation}
                onChange={(e) => setIntake((prev) => ({ ...prev, foundation: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">{uiLanguage === 'zh' ? '请选择' : 'Choose one'}</option>
                {(uiLanguage === 'zh'
                  ? ['零基础', '需要先有成就感', '有一点基础', '中等基础', '学校学过，主要复习', '冲高分']
                  : ['New to this', 'Need quick wins', 'Some foundation', 'Intermediate', 'Reviewing after school', 'Aiming high']
                ).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {uiLanguage === 'zh' ? '考试/目标时间' : 'Exam or target date'}
              </span>
              <input
                value={intake.examTimeline}
                onChange={(e) => setIntake((prev) => ({ ...prev, examTimeline: e.target.value }))}
                placeholder={examTimelinePlaceholder(selectedFramework, uiLanguage === 'zh' ? 'zh' : 'en')}
                className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {uiLanguage === 'zh' ? '目标分数' : 'Target score'}
              </span>
              <input
                value={intake.targetScore}
                onChange={(e) => setIntake((prev) => ({ ...prev, targetScore: e.target.value }))}
                placeholder={targetScorePlaceholder(selectedFramework, uiLanguage === 'zh' ? 'zh' : 'en')}
                className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {uiLanguage === 'zh' ? '每周小时' : 'Hours/week'}
                </span>
                <input
                  type="number"
                  min="1"
                  max="40"
                  value={intake.weeklyHours}
                  onChange={(e) => setIntake((prev) => ({ ...prev, weeklyHours: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {uiLanguage === 'zh' ? '准备月数' : 'Months'}
                </span>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={intake.prepMonths}
                  onChange={(e) => setIntake((prev) => ({ ...prev, prepMonths: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {uiLanguage === 'zh' ? '每周学习日' : 'Study days'}
              </div>
              <div className="flex flex-wrap gap-2">
                {STUDY_DAYS.map((day) => {
                  const active = intake.studyDays.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleStudyDay(day.value)}
                      className={`h-9 rounded-lg border px-3 text-sm font-medium ${
                        active
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {uiLanguage === 'zh' ? `周${day.zh}` : day.en}
                    </button>
                  )
                })}
              </div>
              {intake.studyDays.length === 0 && (
                <p className="text-xs text-amber-700">
                  {uiLanguage === 'zh' ? '请选择至少一天，Mina 才能安排每周节奏。' : 'Choose at least one day so Mina can pace the week.'}
                </p>
              )}
            </div>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {uiLanguage === 'zh' ? '每次小时' : 'Hours/session'}
              </span>
              <input
                type="number"
                min="0.5"
                step="0.5"
                max="8"
                value={intake.hoursPerSession}
                onChange={(e) => setIntake((prev) => ({ ...prev, hoursPerSession: e.target.value }))}
                className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {uiLanguage === 'zh' ? '薄弱点 / 学校进度 / 其他要求' : 'Weak areas / school progress / notes'}
            </span>
            <textarea
              value={intake.weakAreas}
              onChange={(e) => setIntake((prev) => ({ ...prev, weakAreas: e.target.value }))}
              rows={3}
              placeholder={uiLanguage === 'zh' ? '例如：概念听过但题做不出来；学校刚学完微分；想多练大题。' : 'e.g. I know the ideas but struggle with problems; school just finished differentiation.'}
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>

          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">
                  {uiLanguage === 'zh' ? '可选：5题基线自测' : 'Optional: 5-question baseline check'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIntake((prev) => ({ ...prev, baselineConfidence: {} }))}
                className="text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                {uiLanguage === 'zh' ? '先跳过' : 'Skip for now'}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-gray-500">
              {uiLanguage === 'zh'
                ? '不想做自测也可以直接生成。Mina 会从你的基础和备注判断节奏。'
                : 'You can skip this. Mina can infer pacing from your foundation and notes.'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {baselinePrompts(selectedSubject, selectedCourse, uiLanguage === 'zh' ? 'zh' : 'en').map((prompt) => (
                <label key={prompt} className="rounded-lg border border-gray-200 bg-white p-3">
                  <span className="block text-sm text-gray-800">{prompt}</span>
                  <select
                    value={intake.baselineConfidence[prompt] || ''}
                    onChange={(e) => setIntake((prev) => ({
                      ...prev,
                      baselineConfidence: { ...prev.baselineConfidence, [prompt]: e.target.value },
                    }))}
                    className="mt-2 h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-xs outline-none"
                  >
                    <option value="">{uiLanguage === 'zh' ? '未选择' : 'Not answered'}</option>
                    {(uiLanguage === 'zh'
                      ? ['没把握', '有点把握', '比较稳', '很熟练']
                      : ['Not confident', 'Somewhat', 'Mostly steady', 'Very confident']
                    ).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={startChatFromIntake}
            disabled={!intake.foundation || !intake.examTimeline || !intake.weeklyHours || intake.studyDays.length === 0 || isTyping}
            className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uiLanguage === 'zh'
              ? intake.studyDays.length === 0
                ? '选择学习日后生成'
                : '让 Mina 生成计划'
              : intake.studyDays.length === 0
                ? 'Choose study days to continue'
                : 'Let Mina build the plan'}
          </button>
        </div>
      )}

      {/* ── CHATTING PHASE ──────────────────────────────────────────────────── */}
      {shouldShowPlannerWorkflow && phase === 'chatting' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              {uiLanguage === 'zh' ? '和 Mina 确认计划' : 'Confirm the plan with Mina'}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <ReportIssueButton
                surface="study_plan_generation"
                compact
                label={uiLanguage === 'zh' ? '报告生成问题' : 'Report plan issue'}
                severity={error ? 'blocked' : 'confusing'}
                snapshot={{
                  phase,
                  selected_subject: selectedSubject,
                  selected_framework: selectedFramework,
                  selected_course: selectedCourse,
                  chat_stage: chatStage,
                  chat_message_count: chatMessages.length,
                  context_count: contexts.length,
                  is_typing: isTyping,
                  has_streaming_content: Boolean(streamingContent),
                  has_proposed_plan: Boolean(proposedPlan),
                  error: error || undefined,
                }}
              />
              <button
                onClick={() => {
                  setPhase('selecting')
                  setSelectedSubject(null)
                  setSelectedFramework(null)
                  setSelectedCourse(null)
                  setIntake(defaultIntake())
                  setChatMessages([])
                  setChatStage('opening')
                  setUserInput('')
                  setProposedPlan(null)
                  setPlanFeedback('')
                  setCreatedPlanId(null)
                  setAutoSaveStatus('idle')
                  clearStudyPlanDraft()
                  clearContexts()
                }}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                {uiLanguage === 'zh' ? '← 重新选择' : '← Back'}
              </button>
            </div>
          </div>

          {/* Subject + Framework badge */}
          <div className="flex gap-2 flex-wrap">
            {selectedSubject && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                {SUBJECTS.find((s) => s.id === selectedSubject)?.icon}{' '}
                {uiLanguage === 'zh'
                  ? SUBJECTS.find((s) => s.id === selectedSubject)?.labelZh
                  : SUBJECTS.find((s) => s.id === selectedSubject)?.label}
              </span>
            )}
            {selectedFramework && (
              <span className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-800">
                {uiLanguage === 'zh'
                  ? FRAMEWORKS.find((f) => f.id === selectedFramework)?.labelZh
                  : FRAMEWORKS.find((f) => f.id === selectedFramework)?.label}
              </span>
            )}
          </div>

          {/* Chat window */}
          <div className="h-[60vh] sm:h-[420px] overflow-y-auto space-y-4 p-4 bg-gray-50/50 rounded-lg">
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-blue-100 text-blue-900'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="text-sm font-medium mb-1">
                    {message.role === 'user'
                      ? uiLanguage === 'zh'
                        ? '你'
                        : 'You'
                      : uiLanguage === 'zh'
                      ? 'Mina'
                      : 'Mina'}
                  </div>
                  <AssistantMessage content={message.content} />
                  {message.role === 'assistant' && message.id === latestOptionMessageId && message.options && message.options.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {message.options.map((opt, oi) => (
                        <button
                          key={`${message.id}-opt-${oi}`}
                          type="button"
                          onClick={() => handleChipClick(opt)}
                          disabled={isTyping}
                          className="rounded-full border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-2">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 rounded-lg p-4 max-w-[80%]">
                  <div className="text-sm font-medium mb-1">
                    Mina
                  </div>
                  {streamingContent !== null ? (
                    <AssistantMessage content={streamingContent + ' ▍'} />
                  ) : (
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.1s' }}
                      />
                      <div
                        className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: '0.2s' }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
                  {error}
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="space-y-2">
            {/* Hidden file inputs */}
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handlePlanContextUpload(f, 'audio')
                e.target.value = ''
              }}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handlePlanContextUpload(f, 'image')
                e.target.value = ''
              }}
            />

            {/* Uploaded context pills */}
            {contexts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {contexts.map((ctx) => (
                  <span
                    key={ctx.id}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium px-3 py-1"
                  >
                    <span className="shrink-0">{ctx.type === 'audio' ? '🎵' : '🖼️'}</span>
                    <span className="max-w-[200px] truncate">{ctx.title}</span>
                    <button
                      type="button"
                      onClick={() => removeContext(ctx.id)}
                      className="shrink-0 ml-0.5 hover:text-blue-600 transition-colors"
                      title={uiLanguage === 'zh' ? '移除' : 'Remove'}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2 items-end">
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  uiLanguage === 'zh'
                    ? '描述你的基础水平、目标、考试时间线…'
                    : 'Describe your current level, goals, exam timeline…'
                }
                rows={2}
                className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                disabled={isTyping}
              />

              {/* Upload buttons */}
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                disabled={isTyping || isUploading}
                className="rounded-lg border border-gray-300 p-2.5 text-gray-500 hover:text-blue-600 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={uiLanguage === 'zh' ? '上传音频' : 'Upload audio'}
              >
                <Mic size={18} />
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={isTyping || isUploading}
                className="rounded-lg border border-gray-300 p-2.5 text-gray-500 hover:text-blue-600 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={uiLanguage === 'zh' ? '上传图片' : 'Upload image'}
              >
                <ImagePlus size={18} />
              </button>

              <button
                onClick={handleSendMessage}
                disabled={isTyping || !userInput.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uiLanguage === 'zh' ? '发送' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PLAN REVIEW PHASE ───────────────────────────────────────────────── */}
      {shouldShowPlannerWorkflow && phase === 'plan_review' && proposedPlan && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
            {/* Plan header */}
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                    {uiLanguage === 'zh' ? '拟定学习计划' : 'Proposed Study Plan'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {uiLanguage === 'zh' ? '确认后保存' : 'Saved after confirmation'}
                  </span>
                </div>
                <ReportIssueButton
                  surface="study_plan_review"
                  compact
                  label={uiLanguage === 'zh' ? '报告计划问题' : 'Report plan issue'}
                  severity="wrong"
                  snapshot={{
                    phase,
                    selected_subject: selectedSubject,
                    selected_framework: selectedFramework,
                    selected_course: selectedCourse,
                    proposed_title: proposedPlan.title,
                    proposed_subject: proposedPlan.subject,
                    proposed_framework: proposedPlan.framework,
                    estimated_hours: proposedPlan.estimated_hours,
                    unit_count: proposedPlan.units.length,
                    learner_tier: proposedPlan.learner_tier,
                    plan_feedback_len: planFeedback.length,
                  }}
                />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{proposedPlan.title}</h2>
              <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-600">
                <span>
                  {uiLanguage === 'zh' ? '科目：' : 'Subject: '}
                  {uiLanguage === 'zh'
                    ? SUBJECTS.find((s) => s.id === proposedPlan.subject)?.labelZh
                    : SUBJECTS.find((s) => s.id === proposedPlan.subject)?.label}
                </span>
                <span>
                  {uiLanguage === 'zh' ? '框架：' : 'Framework: '}
                  {uiLanguage === 'zh'
                    ? FRAMEWORKS.find((f) => f.id === proposedPlan.framework)?.labelZh
                    : FRAMEWORKS.find((f) => f.id === proposedPlan.framework)?.label}
                </span>
                <span>
                  {uiLanguage === 'zh' ? '预计总时长：' : 'Estimated hours: '}
                  {proposedPlan.estimated_hours}h
                </span>
                {proposedPlan.learner_tier && (
                  <span>
                    {uiLanguage === 'zh' ? '学习节奏：' : 'Learner path: '}
                    {proposedPlan.learner_tier.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
              {planReviewValidationError && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                  {planReviewValidationError}
                </div>
              )}
              <div className="mt-3">
                <FeedbackMoment
                  surface="study_plan_review"
                  interactionId={`study-plan-review-${selectedSubject || proposedPlan.subject}-${selectedFramework || proposedPlan.framework}-${proposedPlan.units.length}`}
                  snapshot={{
                    phase,
                    selected_subject: selectedSubject,
                    selected_framework: selectedFramework,
                    selected_course: selectedCourse,
                    proposed_subject: proposedPlan.subject,
                    proposed_framework: proposedPlan.framework,
                    estimated_hours: proposedPlan.estimated_hours,
                    unit_count: proposedPlan.units.length,
                    learner_tier: proposedPlan.learner_tier,
                    has_weekly_schedule: Boolean(proposedPlan.weekly_schedule?.length),
                    has_engagement_hooks: Boolean(proposedPlan.engagement_hooks?.length),
                  }}
                />
              </div>
            </div>

            {(proposedPlan.pedagogy_profile || proposedPlan.weekly_schedule?.length || proposedPlan.engagement_hooks?.length) && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {proposedPlan.pedagogy_profile && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                    <h3 className="text-sm font-semibold text-blue-950">
                      {uiLanguage === 'zh' ? '学习方式' : 'Learning mode'}
                    </h3>
                    <div className="mt-2 space-y-1 text-sm text-blue-900">
                      {proposedPlan.pedagogy_profile.support_pattern && <p>{proposedPlan.pedagogy_profile.support_pattern}</p>}
                      {proposedPlan.pedagogy_profile.concept_example_practice_test_ratio && (
                        <p className="text-xs text-blue-700">
                          {uiLanguage === 'zh' ? '概念/例题/练习/测试：' : 'Concept/example/practice/test: '}
                          {proposedPlan.pedagogy_profile.concept_example_practice_test_ratio}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {proposedPlan.weekly_schedule?.length ? (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                    <h3 className="text-sm font-semibold text-emerald-950">
                      {uiLanguage === 'zh' ? '每周节奏' : 'Weekly rhythm'}
                    </h3>
                    <div className="mt-2 space-y-1">
                      {proposedPlan.weekly_schedule.map((slot) => (
                        <p key={`${slot.day}-${slot.focus}`} className="text-sm text-emerald-900">
                          <span className="font-semibold">{slot.day}:</span> {slot.focus}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
                {proposedPlan.engagement_hooks?.length ? (
                  <div className="rounded-lg border border-violet-100 bg-violet-50 p-4">
                    <h3 className="text-sm font-semibold text-violet-950">
                      {uiLanguage === 'zh' ? '保持动力' : 'Engagement'}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {proposedPlan.engagement_hooks.map((hook) => (
                        <span key={hook} className="rounded-full bg-white/80 px-2 py-1 text-xs font-medium text-violet-800">
                          {hook}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {(proposedPlan.motivation_safeguards?.length || proposedPlan.scaffolding_rule || proposedPlan.challenge_rule) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                {proposedPlan.challenge_rule || proposedPlan.scaffolding_rule || proposedPlan.motivation_safeguards?.join(' · ')}
              </div>
            )}

            {/* Units list */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                {uiLanguage === 'zh' ? '学习单元' : 'Units'}
              </h3>
              {proposedPlan.units.map((unit, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-gray-200 p-4 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-gray-900">
                        {idx + 1}. {unit.title}
                      </div>
                      {unit.description && (
                        <p className="mt-1 text-sm text-gray-500">{unit.description}</p>
                      )}
                      {unit.topics.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {unit.topics.map((topic, ti) => (
                            <li key={ti} className="text-sm text-gray-600 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                              {topic}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {typeof unit.estimated_hours === 'number' && unit.estimated_hours > 0 && (
                      <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
                        {unit.estimated_hours}h
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="pt-2 space-y-3">
              {planReviewValidationError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {planReviewValidationError}
                </div>
              )}
              <button
                onClick={handleConfirmPlan}
                disabled={isCreating || Boolean(planReviewValidationError)}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {uiLanguage === 'zh' ? '看起来不错，开始学习！' : "Looks good, let's go!"}
              </button>

              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  {uiLanguage === 'zh' ? '想要调整？告诉我哪里需要改：' : 'Want changes? Tell me what to adjust:'}
                </p>
                <div className="flex gap-2 items-end">
                  <textarea
                    value={planFeedback}
                    onChange={(e) => setPlanFeedback(e.target.value)}
                    placeholder={
                      uiLanguage === 'zh'
                        ? '例如：增加更多练习题单元，或调整时间分配…'
                        : 'e.g. Add more practice units, adjust time allocation…'
                    }
                    rows={2}
                    className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    onClick={handleRequestChanges}
                    className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {uiLanguage === 'zh' ? '修改' : 'Revise'}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CREATING PHASE ──────────────────────────────────────────────────── */}
      {shouldShowPlannerWorkflow && phase === 'creating' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
          <p className="text-lg font-medium text-gray-800">
            {uiLanguage === 'zh' ? '正在生成你的学习计划…' : 'Creating your study plan…'}
          </p>
          <p className="text-sm text-gray-500">
            {uiLanguage === 'zh' ? '这可能需要几秒钟，请稍候。' : 'This may take a few seconds.'}
          </p>
        </div>
      )}

      {/* ── DONE PHASE ──────────────────────────────────────────────────────── */}
      {shouldShowPlannerWorkflow && phase === 'done' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-5xl">✅</div>
          <p className="text-xl font-semibold text-gray-900">
            {uiLanguage === 'zh' ? '学习计划已创建！' : 'Study plan created!'}
          </p>
          {createdPlanId && (
            <a
              href={`/study-plan/${createdPlanId}`}
              className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              {uiLanguage === 'zh' ? '查看我的计划' : 'View My Plan'}
            </a>
          )}
        </div>
      )}
    </div>
  )
}
