'use client'

import { useEffect, useState } from 'react'

export interface UserInterestProfile {
  user_id?: string
  grade_level: string | null
  subject_interests: string[]
  current_challenges: string | null
  long_term_goals: string | null
  preferred_learning_style: string | null
  weekly_study_hours: string | null
  onboarding_completed: boolean
  created_at?: string | null
  updated_at?: string | null
}

interface InterestProfileQuizProps {
  language: 'zh' | 'en'
  isSignedIn: boolean
  isLoading: boolean
  isSaving: boolean
  profile: UserInterestProfile | null
  onSave: (profile: UserInterestProfile) => Promise<void>
}

const TOTAL_STEPS = 5

const defaultProfile = (): UserInterestProfile => ({
  grade_level: null,
  subject_interests: [],
  current_challenges: null,
  long_term_goals: null,
  preferred_learning_style: null,
  weekly_study_hours: null,
  onboarding_completed: false,
})

export default function InterestProfileQuiz({
  language,
  isSignedIn,
  isLoading,
  isSaving,
  profile,
  onSave,
}: InterestProfileQuizProps) {
  const [draft, setDraft] = useState<UserInterestProfile>(defaultProfile())
  const [step, setStep] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [customSubject, setCustomSubject] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const nextProfile = profile ? {
      ...defaultProfile(),
      ...profile,
      subject_interests: profile.subject_interests || [],
    } : defaultProfile()

    setDraft(nextProfile)
    setStep(0)
    setError('')
    setCustomSubject('')
    setIsEditing(!nextProfile.onboarding_completed)
  }, [profile?.updated_at, profile?.onboarding_completed, isSignedIn])

  const copy = {
    zh: {
      title: '学习兴趣小问卷',
      subtitle: '用不到一分钟建立你的学习画像，让 AI 从第一次对话就更懂你。',
      signedOutTitle: '登录后保存你的学习画像',
      signedOutBody: '完成这份简短问卷后，后续主题推荐和课程生成会更贴近你的年级、兴趣和目标。',
      summaryTitle: '你的学习画像已就绪',
      summaryBody: 'AI 将优先参考这些背景信息，给你更贴近当下需求的学习建议。',
      edit: '重新编辑',
      save: '保存画像',
      saving: '保存中...',
      next: '下一步',
      back: '上一步',
      stepLabel: '步骤',
      gradeTitle: '你现在处于哪个学习阶段？',
      gradeHint: '选择最接近你的当前状态。',
      subjectsTitle: '你最想重点提升哪些方向？',
      subjectsHint: '可多选，至少选 1 个。',
      challengesTitle: '你现在最常卡住的地方是什么？',
      challengesHint: '比如公式推导、做题速度、概念混淆、没有学习计划等。',
      goalsTitle: '你希望通过 MentorMind 达成什么目标？',
      goalsHint: '写下近期或长期目标，AI 会据此调整推荐方向。',
      styleTitle: '你更喜欢哪种学习方式？',
      styleHint: '这会帮助 AI 调整讲解节奏和表达方式。',
      hoursTitle: '你每周大约能投入多少学习时间？',
      optional: '可选',
      addSubject: '添加',
      customSubjectPlaceholder: '补充学科，比如经济学',
      challengesPlaceholder: '我总是知道答案的方向，但写题时步骤不完整……',
      goalsPlaceholder: '我想在三个月内把微积分基础补起来，并准备之后的机器学习课程。',
      signedOutCta: '登录后即可保存到个人账号',
      labels: {
        grade: '当前阶段',
        subjects: '兴趣方向',
        challenges: '主要困难',
        goals: '学习目标',
        style: '偏好方式',
        hours: '每周投入',
      },
      validation: {
        grade: '请先选择当前学习阶段。',
        subjects: '请至少选择一个兴趣方向。',
        challenges: '请写下当前学习困难。',
        goals: '请写下你的学习目标。',
        style: '请选择偏好的学习方式。',
      },
    },
    en: {
      title: 'Interest Profile Quiz',
      subtitle: 'Build a quick learner profile so the AI has useful context from the very first conversation.',
      signedOutTitle: 'Sign in to save your learner profile',
      signedOutBody: 'This short quiz helps MentorMind recommend topics and lesson directions that fit your level, interests, and goals.',
      summaryTitle: 'Your learner profile is ready',
      summaryBody: 'The AI will use this background to prioritize more relevant recommendations and explanations.',
      edit: 'Edit Profile',
      save: 'Save Profile',
      saving: 'Saving...',
      next: 'Next',
      back: 'Back',
      stepLabel: 'Step',
      gradeTitle: 'Where are you in your learning journey right now?',
      gradeHint: 'Choose the option closest to your current stage.',
      subjectsTitle: 'Which areas do you most want to improve?',
      subjectsHint: 'Pick as many as you want, at least one.',
      challengesTitle: 'What tends to block you most right now?',
      challengesHint: 'For example: derivations, problem speed, confusion between concepts, or weak study planning.',
      goalsTitle: 'What do you want MentorMind to help you achieve?',
      goalsHint: 'Share a short-term or long-term goal so the AI can aim its recommendations better.',
      styleTitle: 'How do you like to learn best?',
      styleHint: 'This helps the AI adjust pacing and explanation style.',
      hoursTitle: 'How much time can you usually study each week?',
      optional: 'Optional',
      addSubject: 'Add',
      customSubjectPlaceholder: 'Add a subject like economics',
      challengesPlaceholder: 'I usually know the idea, but I struggle to turn it into a complete solution...',
      goalsPlaceholder: 'I want to rebuild my calculus foundations over the next three months and prepare for machine learning.',
      signedOutCta: 'Your answers will save to your account once you sign in',
      labels: {
        grade: 'Current stage',
        subjects: 'Focus areas',
        challenges: 'Current blockers',
        goals: 'Learning goals',
        style: 'Preferred style',
        hours: 'Weekly study time',
      },
      validation: {
        grade: 'Choose your current learning stage first.',
        subjects: 'Pick at least one focus area.',
        challenges: 'Add your current learning challenge.',
        goals: 'Add your learning goal.',
        style: 'Choose your preferred learning style.',
      },
    },
  }[language]

  const gradeOptions = [
    { value: 'middle-school', zh: '初中', en: 'Middle School' },
    { value: 'high-school', zh: '高中', en: 'High School' },
    { value: 'undergraduate', zh: '本科', en: 'Undergraduate' },
    { value: 'graduate', zh: '研究生', en: 'Graduate' },
    { value: 'professional', zh: '职场进修', en: 'Professional' },
    { value: 'lifelong-learner', zh: '自学者', en: 'Independent Learner' },
  ]

  const subjectOptions = [
    { value: 'mathematics', zh: '数学', en: 'Mathematics' },
    { value: 'physics', zh: '物理', en: 'Physics' },
    { value: 'chemistry', zh: '化学', en: 'Chemistry' },
    { value: 'biology', zh: '生物', en: 'Biology' },
    { value: 'computer-science', zh: '计算机科学', en: 'Computer Science' },
    { value: 'environmental-science', zh: '环境科学', en: 'Environmental Science' },
    { value: 'history', zh: '历史', en: 'History' },
    { value: 'english', zh: '英语', en: 'English' },
    { value: 'economics', zh: '经济学', en: 'Economics' },
    { value: 'psychology', zh: '心理学', en: 'Psychology' },
    { value: 'government', zh: '政治学', en: 'Government & Politics' },
    { value: 'world-languages', zh: '外国语', en: 'World Languages' },
    { value: 'art', zh: '艺术', en: 'Art' },
  ]

  const styleOptions = [
    {
      value: 'visual',
      zh: '图像化讲解',
      en: 'Visual Explanations',
      descZh: '多用图表、类比和步骤拆解',
      descEn: 'More diagrams, analogies, and visual breakdowns',
    },
    {
      value: 'practice-first',
      zh: '例题驱动',
      en: 'Practice First',
      descZh: '通过例题和练习快速掌握',
      descEn: 'Learn quickly through worked examples and exercises',
    },
    {
      value: 'concept-first',
      zh: '概念先行',
      en: 'Concept First',
      descZh: '先理解原理，再做题巩固',
      descEn: 'Build intuition first, then reinforce with problems',
    },
    {
      value: 'conversational',
      zh: '对话陪学',
      en: 'Conversational Coaching',
      descZh: '像导师一样边问边学',
      descEn: 'A mentor-like style with back-and-forth guidance',
    },
  ]

  const weeklyHoursOptions = [
    { value: '<2', zh: '每周少于 2 小时', en: 'Less than 2 hours' },
    { value: '2-4', zh: '每周 2-4 小时', en: '2-4 hours' },
    { value: '5-8', zh: '每周 5-8 小时', en: '5-8 hours' },
    { value: '9-12', zh: '每周 9-12 小时', en: '9-12 hours' },
    { value: '12+', zh: '每周 12 小时以上', en: '12+ hours' },
  ]

  const toggleSubject = (subject: string) => {
    setDraft((prev) => {
      const exists = prev.subject_interests.includes(subject)
      return {
        ...prev,
        subject_interests: exists
          ? prev.subject_interests.filter((item) => item !== subject)
          : [...prev.subject_interests, subject],
      }
    })
  }

  const addCustomSubject = () => {
    const trimmed = customSubject.trim()
    if (!trimmed) {
      return
    }
    if (!draft.subject_interests.includes(trimmed)) {
      setDraft((prev) => ({
        ...prev,
        subject_interests: [...prev.subject_interests, trimmed],
      }))
    }
    setCustomSubject('')
  }

  const getValidationMessage = () => {
    if (step === 0 && !draft.grade_level) {
      return copy.validation.grade
    }
    if (step === 1 && draft.subject_interests.length === 0) {
      return copy.validation.subjects
    }
    if (step === 2 && !draft.current_challenges?.trim()) {
      return copy.validation.challenges
    }
    if (step === 3 && !draft.long_term_goals?.trim()) {
      return copy.validation.goals
    }
    if (step === 4 && !draft.preferred_learning_style) {
      return copy.validation.style
    }
    return ''
  }

  const goNext = async () => {
    const validationMessage = getValidationMessage()
    if (validationMessage) {
      setError(validationMessage)
      return
    }

    setError('')
    if (step === TOTAL_STEPS - 1) {
      try {
        await onSave({
          ...draft,
          onboarding_completed: true,
        })
        setIsEditing(false)
      } catch {
        setError(language === 'zh' ? '保存时出现问题，请稍后再试。' : 'Something went wrong while saving. Please try again.')
      }
      return
    }
    setStep((prev) => prev + 1)
  }

  const goBack = () => {
    setError('')
    setStep((prev) => Math.max(prev - 1, 0))
  }

  const getLabel = (item: { zh: string; en: string }) => language === 'zh' ? item.zh : item.en
  const formatOptionValue = (
    value: string | null | undefined,
    options: Array<{ value: string; zh: string; en: string }>
  ) => {
    if (!value) {
      return '-'
    }
    const match = options.find((option) => option.value === value)
    return match ? getLabel(match) : value
  }

  const formattedSubjects = draft.subject_interests.map((subject) => {
    const match = subjectOptions.find((option) => option.value === subject)
    return match ? getLabel(match) : subject
  })

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-32 rounded bg-gray-200"></div>
          <div className="h-8 w-72 rounded bg-gray-200"></div>
          <div className="h-20 rounded-xl bg-gray-100"></div>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="max-w-3xl">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {copy.title}
          </span>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">{copy.signedOutTitle}</h2>
          <p className="mt-2 text-gray-600">{copy.signedOutBody}</p>
          <div className="mt-4 rounded-lg border border-dashed border-blue-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-800">
            {copy.signedOutCta}
          </div>
        </div>
      </div>
    )
  }

  if (draft.onboarding_completed && !isEditing) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
              {copy.summaryTitle}
            </span>
            <p className="mt-3 text-gray-600">{copy.summaryBody}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsEditing(true)
              setStep(0)
              setError('')
            }}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {copy.edit}
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SummaryCard label={copy.labels.grade} value={formatOptionValue(draft.grade_level, gradeOptions)} />
          <SummaryCard label={copy.labels.subjects} value={formattedSubjects.join(', ') || '-'} />
          <SummaryCard label={copy.labels.style} value={formatOptionValue(draft.preferred_learning_style, styleOptions)} />
          <SummaryCard label={copy.labels.hours} value={formatOptionValue(draft.weekly_study_hours, weeklyHoursOptions)} />
          <SummaryCard label={copy.labels.challenges} value={draft.current_challenges || '-'} />
          <SummaryCard label={copy.labels.goals} value={draft.long_term_goals || '-'} />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 via-white to-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
              {copy.title}
            </span>
            <h2 className="mt-3 text-2xl font-bold text-gray-900">{copy.title}</h2>
            <p className="mt-2 text-gray-600">{copy.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
              <div
                key={index}
                className={`h-2.5 w-10 rounded-full ${index <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="text-sm font-medium text-blue-700">
            {copy.stepLabel} {step + 1} / {TOTAL_STEPS}
          </div>
          {draft.onboarding_completed && (
            <div className="text-sm text-gray-500">{copy.optional}</div>
          )}
        </div>

        {step === 0 && (
          <section className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{copy.gradeTitle}</h3>
              <p className="mt-1 text-sm text-gray-500">{copy.gradeHint}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {gradeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, grade_level: option.value }))}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    draft.grade_level === option.value
                      ? 'border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-100'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-semibold text-gray-900">{getLabel(option)}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{copy.subjectsTitle}</h3>
              <p className="mt-1 text-sm text-gray-500">{copy.subjectsHint}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {subjectOptions.map((subject) => {
                const label = getLabel(subject)
                const selected = draft.subject_interests.includes(subject.value)
                return (
                  <button
                    key={subject.value}
                    type="button"
                    onClick={() => toggleSubject(subject.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                      selected
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 text-gray-700 hover:border-blue-300 hover:text-blue-700'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
              {draft.subject_interests
                .filter((subject) => !subjectOptions.some((item) => item.value === subject))
                .map((subject) => (
                  <button
                    key={subject}
                    type="button"
                    onClick={() => toggleSubject(subject)}
                    className="rounded-full border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    {subject}
                  </button>
                ))}
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/70 p-4 sm:flex-row">
              <input
                type="text"
                value={customSubject}
                onChange={(event) => setCustomSubject(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addCustomSubject()
                  }
                }}
                placeholder={copy.customSubjectPlaceholder}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={addCustomSubject}
                className="rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                {copy.addSubject}
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{copy.challengesTitle}</h3>
              <p className="mt-1 text-sm text-gray-500">{copy.challengesHint}</p>
            </div>
            <textarea
              value={draft.current_challenges || ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, current_challenges: event.target.value }))}
              placeholder={copy.challengesPlaceholder}
              className="min-h-[160px] w-full rounded-xl border border-gray-300 px-4 py-4 text-sm leading-6 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
          </section>
        )}

        {step === 3 && (
          <section className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{copy.goalsTitle}</h3>
              <p className="mt-1 text-sm text-gray-500">{copy.goalsHint}</p>
            </div>
            <textarea
              value={draft.long_term_goals || ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, long_term_goals: event.target.value }))}
              placeholder={copy.goalsPlaceholder}
              className="min-h-[160px] w-full rounded-xl border border-gray-300 px-4 py-4 text-sm leading-6 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />

            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold text-gray-900">{copy.hoursTitle}</h4>
                <span className="text-xs text-gray-400">{copy.optional}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                {weeklyHoursOptions.map((option) => {
                  const label = getLabel(option)
                  const selected = draft.weekly_study_hours === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, weekly_study_hours: option.value }))}
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 text-gray-700 hover:border-blue-300'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {step === 4 && (
          <section className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{copy.styleTitle}</h3>
              <p className="mt-1 text-sm text-gray-500">{copy.styleHint}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {styleOptions.map((option) => {
                const title = getLabel(option)
                const description = language === 'zh' ? option.descZh : option.descEn
                const selected = draft.preferred_learning_style === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, preferred_learning_style: option.value }))}
                    className={`rounded-xl border p-5 text-left transition-all ${
                      selected
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-base font-semibold text-gray-900">{title}</div>
                    <div className="mt-2 text-sm leading-6 text-gray-600">{description}</div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copy.back}
          </button>

          <button
            type="button"
            onClick={goNext}
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? copy.saving : step === TOTAL_STEPS - 1 ? copy.save : copy.next}
          </button>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-sm leading-6 text-gray-800">{value}</div>
    </div>
  )
}
