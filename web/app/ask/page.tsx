'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, BookOpen, FileText, ImagePlus, Loader2, Mic, Send, Trash2 } from 'lucide-react'
import { useAuth } from '../components/AuthContext'
import { useLanguage } from '../components/LanguageContext'
import { PageHead } from '../components/design/primitives'
import { FeedbackMoment } from '../components/FeedbackMoment'
import { MathText } from '../components/MathText'
import { useIngestUpload } from '../hooks/useIngestUpload'
import { track } from '../lib/telemetry'

interface AnswerState {
  answer: string
  next_steps: string[]
  answer_mode?: 'problem' | 'discussion'
}

const QUICK_QUESTION_PLAN_PREFILL_KEY = 'mm-quick-question-study-plan-prefill-v1'

export default function AskPage() {
  const router = useRouter()
  const { getToken, isLoaded, isSignedIn, signOut } = useAuth()
  const { language } = useLanguage()
  const [question, setQuestion] = useState('')
  const [context, setContext] = useState('')
  const [subject, setSubject] = useState('')
  const [practiceProblem, setPracticeProblem] = useState('')
  const [practiceAttempt, setPracticeAttempt] = useState('')
  const [discussionReply, setDiscussionReply] = useState('')
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainTarget, setExplainTarget] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState<AnswerState | null>(null)

  const lang = language === 'zh' ? 'zh' : 'en'
  const {
    contexts,
    isUploading,
    handleAudioUpload,
    handleImageUpload,
    handleTextUpload,
    getLastUploadErrorMessage,
    clearUploadError,
    removeContext,
    buildContextMessage,
    clearContexts,
  } = useIngestUpload(lang, {
    getToken,
    onAuthInvalid: signOut,
    syncImageOcr: true,
    maxAudioBytes: 25 * 1024 * 1024,
    maxAudioDurationSeconds: 12 * 60,
  })

  const handleContextFile = async (file: File | undefined) => {
    if (!file) return
    setError('')
    clearUploadError()
    const lower = file.name.toLowerCase()
    const isTextLike =
      file.type.startsWith('text/') ||
      lower.endsWith('.txt') ||
      lower.endsWith('.md') ||
      lower.endsWith('.csv') ||
      lower.endsWith('.json')
    const isSupported =
      file.type.startsWith('audio/') ||
      file.type.startsWith('image/') ||
      lower.endsWith('.pdf') ||
      isTextLike
    if (!isSupported) {
      setError(
        language === 'zh'
          ? '上传失败：文件格式不支持。请上传图片、PDF、音频，或 txt/md/csv/json 文本文件。'
          : 'Upload failed: unsupported file type. Upload an image, PDF, audio, or txt/md/csv/json text file.',
      )
      return
    }
    const result = file.type.startsWith('audio/')
      ? await handleAudioUpload(file)
      : file.type.startsWith('image/') || lower.endsWith('.pdf')
        ? await handleImageUpload(file)
        : isTextLike
          ? await handleTextUpload(file)
          : null

    if (!result) {
      setError(getLastUploadErrorMessage())
    }
  }

  const submitQuestion = async (questionText: string, extraContext?: string): Promise<AnswerState | null> => {
    if (!questionText.trim()) {
      setError(language === 'zh' ? '先输入你的问题。' : 'Add your question first.')
      return null
    }
    setLoading(true)
    setError('')
    setAnswer(null)
    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch('/api/backend/quick-question', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question: questionText.trim(),
          context: ([context.trim(), buildContextMessage(), extraContext?.trim()].filter(Boolean).join('\n\n') || undefined)?.slice(0, 12000),
          subject: subject.trim() || undefined,
          language: lang,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.detail || data.error || 'Request failed')
      const nextAnswer = {
        answer: data.answer || '',
        next_steps: data.next_steps || [],
        answer_mode: data.answer_mode === 'discussion' ? 'discussion' : 'problem',
      } satisfies AnswerState
      setAnswer(nextAnswer)
      return nextAnswer
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to answer question')
      return null
    } finally {
      setLoading(false)
    }
  }

  const submit = async () => {
    setPracticeProblem('')
    setPracticeAttempt('')
    setDiscussionReply('')
    setExplainOpen(false)
    await submitQuestion(question)
  }

  const handleNextStep = async (step: string, index: number) => {
    if (!answer || loading || isUploading) return

    const lower = step.toLowerCase()
    const wantsStudyPlan = lower.includes('study plan') || step.includes('学习计划')
    const previousContext = language === 'zh'
      ? `上一题：\n${question}\n\n上一轮解答：\n${answer.answer}`
      : `Previous question:\n${question}\n\nPrevious answer:\n${answer.answer}`

    if (wantsStudyPlan) {
      try {
        window.localStorage.setItem(QUICK_QUESTION_PLAN_PREFILL_KEY, JSON.stringify({
          savedAt: Date.now(),
          language: lang,
          subject,
          question,
          context,
          uploadedContext: buildContextMessage(),
          answer: answer.answer,
        }))
      } catch {
        // The route still works if storage is unavailable; it just starts empty.
      }
      router.push('/study-plan?source=quick-question')
      return
    }

    if (answer.answer_mode === 'discussion') {
      const discussionPrompt = lower.includes('outline') || step.includes('提纲')
        ? (language === 'zh'
            ? '请把刚才的材料整理成一个课堂讨论提纲：核心命题、3个证据点、2个可争论问题、1个可延伸到现实/历史的连接。'
            : 'Turn the material into a class discussion outline: core claim, 3 evidence points, 2 debatable questions, and 1 connection to a broader real-world or historical issue.')
        : lower.includes('paragraph') || step.includes('回答')
          ? (language === 'zh'
              ? '请根据刚才的材料，写一段适合课堂讨论或短答题的回答。要求：观点清楚、引用材料依据、最后留一个可继续讨论的问题。'
              : 'Draft a discussion-ready response paragraph based on the material. Make a clear claim, cite evidence from the material, and end with one question that keeps the discussion open.')
          : (language === 'zh'
              ? '请选择刚才回答里最值得深挖的一个观点，用苏格拉底式追问展开：先说明为什么这个观点重要，再提出2个追问，并给一个可能的回答方向。'
              : 'Choose the most important idea from the previous answer and push it deeper with Socratic follow-up: explain why it matters, ask 2 probing questions, and give one possible direction for answering.')

      setPracticeProblem('')
      setPracticeAttempt('')
      setDiscussionReply('')
      setExplainOpen(false)
      await submitQuestion(discussionPrompt, previousContext)
      return
    }

    const followUp = index === 0 || lower.includes('similar') || step.includes('相似')
      ? (language === 'zh'
          ? '请基于刚才这道题，出一道相似但数字或边界略有变化的练习题。先只给题目、一个提示和答案检查点，不要直接给完整解答。'
          : 'Create one similar practice problem based on the previous question, changing the numbers or boundaries slightly. Give only the problem, one hint, and an answer checkpoint, not the full solution.')
      : (language === 'zh'
          ? '请选择刚才解答中最关键或最容易出错的一步，用更慢的方式解释，并给我一个检查理解的小问题。'
          : 'Choose the most important or easiest-to-miss step in the previous answer, explain it more slowly, and give me one check-for-understanding question.')

    if (index === 1 || lower.includes('explain') || step.includes('解释')) {
      setExplainOpen(true)
      setExplainTarget('')
      setPracticeProblem('')
      setPracticeAttempt('')
      return
    }

    setQuestion(followUp)
    const nextAnswer = await submitQuestion(followUp, previousContext)
    if (nextAnswer && (index === 0 || lower.includes('similar') || step.includes('相似'))) {
      setPracticeProblem(nextAnswer.answer)
      setPracticeAttempt('')
      setDiscussionReply('')
      setExplainOpen(false)
    }
  }

  const submitDiscussionReply = async (mode: 'probe' | 'counter' | 'draft') => {
    if (!answer || loading) return
    const replyText = discussionReply.trim()
    if (!replyText) {
      setError(language === 'zh' ? '先写一句你的回应，再让 Mina 继续追问。' : 'Write your response first, then let Mina continue.')
      return
    }

    const previousContext = language === 'zh'
      ? `原问题：\n${question}\n\nMina上一轮回答：\n${answer.answer}\n\n我的回应：\n${replyText}`
      : `Original question:\n${question}\n\nMina's previous answer:\n${answer.answer}\n\nMy response:\n${replyText}`
    const prompt = mode === 'probe'
      ? (language === 'zh'
          ? '请像Mina导师一样追问我的回应。先判断我是否抓住了核心，再指出一个薄弱处，最后只问我一个更尖锐的问题。不要直接替我完成答案。'
          : 'Continue as Mina. First judge whether my response catches the core idea, then point out one weak spot, and end with one sharper follow-up question. Do not finish the answer for me.')
      : mode === 'counter'
        ? (language === 'zh'
            ? '请针对我的回应给一个有力反方观点，并问我如何回应这个反方观点。'
            : 'Give one strong counterargument to my response, then ask how I would answer that counterargument.')
        : (language === 'zh'
            ? '请把我的回应整理成一段课堂可用短答，保留我的观点，但补上逻辑连接和材料依据。最后给我一句可以继续讨论的问题。'
            : 'Turn my response into a class-ready short answer. Keep my claim, add logical links and evidence from the material, and end with one discussion question.')

    try {
      track('interaction', { area: 'ask_discussion_reply', action: mode, answer_mode: 'discussion' })
    } catch {
      // Best-effort telemetry only.
    }
    setPracticeProblem('')
    setPracticeAttempt('')
    setExplainOpen(false)
    const nextAnswer = await submitQuestion(prompt, previousContext)
    if (nextAnswer) setDiscussionReply('')
  }

  const verifyPracticeAttempt = async (mode: 'check' | 'hint' | 'solution') => {
    if (!practiceProblem || loading) return
    if (mode === 'check' && !practiceAttempt.trim()) {
      setError(language === 'zh' ? '先写下你的答案或解题过程，再让 Mina 检查。' : 'Write your answer or work first, then ask Mina to check it.')
      return
    }

    const practiceContext = language === 'zh'
      ? `练习题：\n${practiceProblem}\n\n我的答案/过程：\n${practiceAttempt || '(还没有作答)'}`
      : `Practice problem:\n${practiceProblem}\n\nMy answer/work:\n${practiceAttempt || '(not answered yet)'}`
    const prompt = mode === 'check'
      ? (language === 'zh'
          ? '请检查我的答案和过程。先判断是否正确；如果错了，只指出第一个关键错误并给一个修正提示，不要直接重做整题。'
          : 'Check my answer and work. First say whether it is correct; if it is wrong, identify only the first key mistake and give one correction hint, not a full re-solve.')
      : mode === 'hint'
        ? (language === 'zh'
            ? '请基于这道练习题给我一个提示，不要直接给完整解答。'
            : 'Give me one hint for this practice problem, but do not provide the full solution.')
        : (language === 'zh'
            ? '请给出这道练习题的完整标准解答，并标出最容易错的一步。'
            : 'Give the full worked solution for this practice problem and mark the easiest step to get wrong.')

    setQuestion(prompt)
    await submitQuestion(prompt, practiceContext)
  }

  const submitExplainStep = async (chooseForMe = false) => {
    if (!answer || loading) return
    const previousContext = language === 'zh'
      ? `上一题：\n${question}\n\n上一轮解答：\n${answer.answer}`
      : `Previous question:\n${question}\n\nPrevious answer:\n${answer.answer}`
    const prompt = chooseForMe
      ? (language === 'zh'
          ? '请从刚才的解答中选择最关键或最容易出错的一步，用更慢的方式解释，并给一个检查理解的小问题。'
          : 'Choose the most important or easiest-to-miss step from the previous answer, explain it more slowly, and give one check-for-understanding question.')
      : (language === 'zh'
          ? `请重点解释这一步：${explainTarget.trim()}。用更慢的方式说明为什么这样做，并给一个检查理解的小问题。`
          : `Focus on this step: ${explainTarget.trim()}. Explain why it works more slowly, then give one check-for-understanding question.`)
    if (!chooseForMe && !explainTarget.trim()) {
      setError(language === 'zh' ? '先写下你想解释的步骤，或点“让 Mina 选择关键步骤”。' : 'Write the step you want explained, or choose “let Mina pick the key step.”')
      return
    }
    setQuestion(prompt)
    setExplainOpen(false)
    setPracticeProblem('')
    setPracticeAttempt('')
    await submitQuestion(prompt, previousContext)
  }

  if (isLoaded && !isSignedIn) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-600">
          {language === 'zh' ? '登录后可以直接提问。' : 'Sign in to ask a quick question.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow={language === 'zh' ? '快速提问' : 'Quick question'}
        title={language === 'zh' ? '只问一道题' : 'Ask one question'}
        kicker={
          language === 'zh'
            ? '跳过学习计划和视频生成，直接让 Mina 帮你拆解一个问题。'
            : 'Skip planning and video generation. Let Mina unpack one problem directly.'
        }
      />

      <div className="grid grid-cols-1 gap-5 min-[1400px]:grid-cols-[minmax(0,560px)_minmax(460px,1fr)]">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <BookOpen size={17} className="text-blue-600" />
            {language === 'zh' ? '问题' : 'Question'}
          </div>
          <div className="space-y-3">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={7}
              placeholder={
                language === 'zh'
                  ? '把题目、你卡住的步骤、或你的想法写在这里…'
                  : 'Paste the problem, the step you are stuck on, or your current attempt…'
              }
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={language === 'zh' ? '科目，可选，例如 AP Physics' : 'Subject, optional, e.g. AP Physics'}
              className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              rows={4}
              placeholder={
                language === 'zh'
                  ? '补充上下文，可选：课堂笔记、老师要求、你已经试过的方法…'
                  : 'Optional context: class notes, teacher requirements, what you already tried…'
              }
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {language === 'zh' ? '上传上下文' : 'Upload context'}
                </div>
                {contexts.length > 0 && (
                  <button
                    type="button"
                    onClick={clearContexts}
                    className="text-xs font-medium text-gray-500 hover:text-red-600"
                  >
                    {language === 'zh' ? '清空' : 'Clear'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 ${isUploading ? 'opacity-50' : ''}`}>
                  <ImagePlus size={15} />
                  {language === 'zh' ? '图片/PDF' : 'Image/PDF'}
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    disabled={isUploading}
                    className="hidden"
                    onChange={(event) => {
                      void handleContextFile(event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </label>
                <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 ${isUploading ? 'opacity-50' : ''}`}>
                  <Mic size={15} />
                  {language === 'zh' ? '音频' : 'Audio'}
                  <input
                    type="file"
                    accept="audio/*"
                    disabled={isUploading}
                    className="hidden"
                    onChange={(event) => {
                      void handleContextFile(event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </label>
                <label className={`inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 ${isUploading ? 'opacity-50' : ''}`}>
                  <FileText size={15} />
                  {language === 'zh' ? '文本' : 'Text'}
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.json,text/*"
                    disabled={isUploading}
                    className="hidden"
                    onChange={(event) => {
                      void handleContextFile(event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </label>
              </div>
              {isUploading && (
                <div className="mt-2 flex items-center gap-2 text-xs text-blue-700">
                  <Loader2 size={13} className="animate-spin" />
                  {language === 'zh' ? '正在读取上传内容…' : 'Reading uploaded context...'}
                </div>
              )}
              {contexts.length > 0 && (
                <div className="mt-3 space-y-2">
                  {contexts.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                      <div className="mt-0.5 text-gray-500">
                        {item.type === 'audio' ? <Mic size={14} /> : item.type === 'image' ? <ImagePlus size={14} /> : <FileText size={14} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-gray-800">{item.title}</div>
                        <div className="line-clamp-2 text-xs text-gray-500">{item.summary}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeContext(item.id)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={language === 'zh' ? '移除上下文' : 'Remove context'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={loading || isUploading || !question.trim()}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              {language === 'zh' ? '问 Mina' : 'Ask Mina'}
            </button>
          </div>
        </div>

        <div className="min-h-[420px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {!answer && !error && (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center text-sm text-gray-500">
              {language === 'zh' ? '答案会显示在这里。' : 'The answer will appear here.'}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {answer && (
            <div className="space-y-4">
              {answer.answer_mode === 'discussion' && (
                <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  {language === 'zh' ? '阅读讨论' : 'Discussion'}
                </div>
              )}
              <div className={answer.answer_mode === 'discussion' ? 'rounded-lg border border-amber-100 bg-amber-50/40 p-4' : ''}>
                <MathText content={answer.answer} />
              </div>
              <FeedbackMoment
                surface="quick_question"
                interactionId={`ask-${answer.answer_mode || 'problem'}-${question.slice(0, 40)}`}
                snapshot={{
                  answer_mode: answer.answer_mode || 'problem',
                  language: lang,
                  subject: subject || null,
                  has_uploaded_context: contexts.length > 0,
                  next_steps: answer.next_steps,
                }}
              />
              {answer.answer_mode === 'discussion' && (
                <div className="rounded-lg border border-amber-200 bg-white p-3 shadow-sm">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                    {language === 'zh' ? '轮到你回应' : 'Your Turn'}
                  </div>
                  <textarea
                    value={discussionReply}
                    onChange={(event) => setDiscussionReply(event.target.value)}
                    rows={4}
                    placeholder={
                      language === 'zh'
                        ? '写一句你的理解、反对意见、例子，或你不确定的地方…'
                        : 'Write your take, objection, example, or the part you are unsure about...'
                    }
                    className="w-full resize-none rounded-lg border border-amber-200 bg-amber-50/30 px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(language === 'zh'
                      ? ['我觉得核心是…', '我不同意，因为…', '一个例子是…']
                      : ['I think the core is...', 'I disagree because...', 'One example is...']
                    ).map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => setDiscussionReply((prev) => (prev.trim() ? `${prev.trim()} ${starter}` : starter))}
                        className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
                    <button
                      type="button"
                      onClick={() => { void submitDiscussionReply('probe') }}
                      disabled={loading}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {language === 'zh' ? '让 Mina 追问我' : 'Have Mina Probe Me'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void submitDiscussionReply('counter') }}
                      disabled={loading}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-200 bg-white px-3 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                    >
                      {language === 'zh' ? '给我反方观点' : 'Give a Counterpoint'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void submitDiscussionReply('draft') }}
                      disabled={loading}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {language === 'zh' ? '整理成短答' : 'Draft My Answer'}
                    </button>
                  </div>
                </div>
              )}
              {practiceProblem && (
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                    {language === 'zh' ? '写下你的答案' : 'Write Your Attempt'}
                  </div>
                  <textarea
                    value={practiceAttempt}
                    onChange={(event) => setPracticeAttempt(event.target.value)}
                    rows={4}
                    placeholder={language === 'zh' ? '把你的答案、关键步骤或卡住的地方写在这里…' : 'Write your answer, key steps, or where you got stuck...'}
                    className="w-full resize-none rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
                    <button
                      type="button"
                      onClick={() => { void verifyPracticeAttempt('check') }}
                      disabled={loading}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {language === 'zh' ? '检查我的答案' : 'Check My Answer'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void verifyPracticeAttempt('hint') }}
                      disabled={loading}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-200 bg-white px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      {language === 'zh' ? '给我一个提示' : 'Give Me a Hint'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void verifyPracticeAttempt('solution') }}
                      disabled={loading}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {language === 'zh' ? '看完整解答' : 'Show Solution'}
                    </button>
                  </div>
                </div>
              )}
              {explainOpen && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {language === 'zh' ? '选择要解释的步骤' : 'Choose the Step'}
                  </div>
                  <textarea
                    value={explainTarget}
                    onChange={(event) => setExplainTarget(event.target.value)}
                    rows={3}
                    placeholder={language === 'zh' ? '例如：为什么半径下限是 (3/2)secθ？' : 'Example: why is the lower radius (3/2)secθ?'}
                    className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => { void submitExplainStep(false) }}
                      disabled={loading}
                      className="inline-flex h-9 items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {language === 'zh' ? '解释这一步' : 'Explain This Step'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { void submitExplainStep(true) }}
                      disabled={loading}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {language === 'zh' ? '让 Mina 选择关键步骤' : 'Let Mina Pick the Key Step'}
                    </button>
                  </div>
                </div>
              )}
              {answer.next_steps.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {answer.answer_mode === 'discussion'
                      ? (language === 'zh' ? '继续讨论' : 'Continue the Discussion')
                      : (language === 'zh' ? '下一步' : 'Next')}
                  </div>
                  <div className="space-y-2">
                    {answer.next_steps.map((step, index) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => { void handleNextStep(step, index) }}
                        disabled={loading || isUploading}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          answer.answer_mode === 'discussion'
                            ? 'bg-amber-50/60 text-gray-800 hover:bg-amber-100 hover:text-amber-900'
                            : 'bg-gray-50 text-gray-700 hover:bg-blue-50 hover:text-blue-800'
                        }`}
                      >
                        <ArrowRight size={14} className={answer.answer_mode === 'discussion' ? 'text-amber-700' : 'text-blue-600'} />
                        {step}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
