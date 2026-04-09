'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '@clerk/nextjs'
import { translations } from '../lib/translations'
import SessionContextCard from '../components/Chat/SessionContextCard'
import InterestProfileQuiz, { UserInterestProfile } from '../components/InterestProfileQuiz'

// ── Lightweight MD + LaTeX renderer ─────────────────────────────────────────
function MentorMessage({ content }: { content: string }) {
  // Split on LaTeX delimiters first, then render markdown inline
  const renderInline = (text: string, key: string | number) => {
    // Bold **text**
    const bold = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic *text* or _text_
    const italic = bold.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
                       .replace(/_(.+?)_/g, '<em>$1</em>')
    // Inline code `code`
    const code = italic.replace(/`([^`]+)`/g, '<code class="bg-gray-200 rounded px-1 py-0.5 text-xs font-mono">$1</code>')
    return <span key={key} dangerouslySetInnerHTML={{ __html: code }} />
  }

  const renderContent = (raw: string) => {
    const parts: React.ReactNode[] = []
    // Match $...$ LaTeX blocks
    const re = /\$([^$]+)\$/g
    let last = 0, m: RegExpExecArray | null, i = 0
    while ((m = re.exec(raw)) !== null) {
      if (m.index > last) parts.push(renderInline(raw.slice(last, m.index), i++))
      parts.push(
        <span key={i++} className="font-mono bg-blue-50 text-blue-800 rounded px-1 py-0.5 text-sm border border-blue-100">
          {m[1]}
        </span>
      )
      last = m.index + m[0].length
    }
    if (last < raw.length) parts.push(renderInline(raw.slice(last), i++))
    return parts
  }

  return (
    <div className="text-sm leading-relaxed space-y-1">
      {content.split('\n').map((line, li) => (
        <p key={li} className={line.trim() === '' ? 'h-2' : ''}>
          {renderContent(line)}
        </p>
      ))}
    </div>
  )
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface IdentifiedTopic {
  id: string
  name: string
  name_zh?: string
  name_en?: string
  description: string
  description_zh?: string
  description_en?: string
  confidence: number
  icon: string
  category: string
  follow_up_questions?: string[]
  follow_up_questions_zh?: string[]
  follow_up_questions_en?: string[]
}

interface Voice {
  id: string
  name: string
  gender: string
  language?: string
}

interface LearningContext {
  id: string;
  type: 'image' | 'audio' | 'document';
  title: string;
  summary: string;
  timestamp: Date;
}

interface LessonDesignSettings {
  showThinkingPath: boolean
  enableSeminar: boolean
  enableSimulation: boolean
  enableOralDefense: boolean
  addDeliberateError: boolean
  personalAnchor: string
}

interface LessonDesignOption {
  key: keyof LessonDesignSettings
  labelZh: string
  labelEn: string
  value: boolean
}

export default function CreateLessonPage() {
  const router = useRouter()
  const { language: uiLanguage, contentLanguage, t } = useLanguage()
  const { getToken, isLoaded: authLoaded, isSignedIn } = useAuth()
  const [workflowPhase, setWorkflowPhase] = useState<'chatting' | 'roadmap' | 'generating' | 'preview'>('chatting')
  const [mentorStage, setMentorStage] = useState<'opening' | 'diagnostic' | 'roadmap' | 'co_creation' | 'locked'>('opening')
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [interestProfile, setInterestProfile] = useState<UserInterestProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)

  // E: Diagnostic onboarding state
  const [diagnosticTurn, setDiagnosticTurn] = useState(0)  // 0 = not started, 1-3 = in progress
  const [diagnosticTopic, setDiagnosticTopic] = useState('')
  const [diagnosticHistory, setDiagnosticHistory] = useState<Array<{role: string; content: string}>>([])
  const [diagnosticRunning, setDiagnosticRunning] = useState(false)
  const [aiTestingMode, setAiTestingMode] = useState(false)  // AI testing toggle

  // Auto-scroll chat to bottom on new messages or streaming updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingContent])

  // Initialize chat message based on language
  useEffect(() => {
    if (chatMessages.length === 0) {
      setChatMessages([
        {
          id: '1',
          role: 'assistant',
          content: uiLanguage === 'zh'
            ? '嘿！准备好今天一起攻克数学了吗？告诉我哪个概念让你头疼，或者你正在冲刺什么考试目标。'
            : 'Hey there! Ready to tackle some math today? Tell me what concept is giving you a hard time or what exam goal you are chasing right now.',
          timestamp: new Date()
        }
      ])
    }
  }, [uiLanguage, chatMessages.length])

  const [userInput, setUserInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [identifiedTopics, setIdentifiedTopics] = useState<IdentifiedTopic[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
  const [proposedSyllabus, setProposedSyllabus] = useState<any>(null)
  const [thinkingProcess, setThinkingProcess] = useState<string | null>(null)
  const [diagnosticQuestion, setDiagnosticQuestion] = useState<string | null>(null)
  const [nextActionLabel, setNextActionLabel] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<any>(null)

  const [form, setForm] = useState({
    studentQuery: '',
    studentLevel: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    duration: 30,
    includeVideo: true,
    language: 'zh-CN',
    voiceId: 'anna'
  })

  const [voices, setVoices] = useState<Voice[]>([])
  const [lessonDesign, setLessonDesign] = useState<LessonDesignSettings>({
    showThinkingPath: true,
    enableSeminar: true,
    enableSimulation: false,
    enableOralDefense: false,
    addDeliberateError: false,
    personalAnchor: '',
  })

  // Audio/Image upload state
  const [isUploadingAudio, setIsUploadingAudio] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [sessionContext, setSessionContext] = useState<LearningContext[]>([])
  const [preferredVoice, setPreferredVoice] = useState('anna')
  
  const audioInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const loadInterestProfile = async () => {
      if (!authLoaded) {
        return
      }

      if (!isSignedIn) {
        setInterestProfile(null)
        setProfileLoading(false)
        return
      }

      setProfileLoading(true)
      try {
        const token = await getToken()
        const headers: Record<string, string> = {}
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }

        const response = await fetch('/api/backend/users/me/profile', { headers })
        if (!response.ok) {
          throw new Error(`Failed to load profile: ${response.status}`)
        }

        const data = await response.json()
        setInterestProfile(data)
      } catch (error) {
        console.error('Failed to load interest profile:', error)
      } finally {
        setProfileLoading(false)
      }
    }

    loadInterestProfile()
  }, [authLoaded, getToken, isSignedIn])

  const buildProfilePromptContext = (profile: UserInterestProfile | null) => {
    if (!profile?.onboarding_completed) {
      return ''
    }

    const humanizeProfileValue = (value: string) => {
      const labels: Record<string, string> = {
        'middle-school': 'Middle School',
        'high-school': 'High School',
        undergraduate: 'Undergraduate',
        graduate: 'Graduate',
        professional: 'Professional',
        'lifelong-learner': 'Independent Learner',
        mathematics: 'Mathematics',
        'computer-science': 'Computer Science',
        physics: 'Physics',
        chemistry: 'Chemistry',
        biology: 'Biology',
        english: 'English',
        visual: 'Visual Explanations',
        'practice-first': 'Practice First',
        'concept-first': 'Concept First',
        conversational: 'Conversational Coaching',
        '<2': 'Less than 2 hours',
        '2-4': '2-4 hours',
        '5-8': '5-8 hours',
        '9-12': '9-12 hours',
        '12+': '12+ hours',
      }
      return labels[value] || value
    }

    const lines = [
      profile.grade_level ? `Current stage: ${humanizeProfileValue(profile.grade_level)}` : null,
      profile.subject_interests?.length
        ? `Focus subjects: ${profile.subject_interests.map(humanizeProfileValue).join(', ')}`
        : null,
      profile.current_challenges ? `Current challenges: ${profile.current_challenges}` : null,
      profile.long_term_goals ? `Goals: ${profile.long_term_goals}` : null,
      profile.preferred_learning_style
        ? `Preferred learning style: ${humanizeProfileValue(profile.preferred_learning_style)}`
        : null,
      profile.weekly_study_hours ? `Weekly study time: ${humanizeProfileValue(profile.weekly_study_hours)}` : null,
    ].filter(Boolean)

    if (lines.length === 0) {
      return ''
    }

    return `Learner profile:\n${lines.join('\n')}`
  }

  const buildGenerationRequirements = (topic: string) => {
    const sections: string[] = []
    const trimmedNotes = form.studentQuery.trim()
    const profileContext = buildProfilePromptContext(interestProfile)
    const sessionContextLines = sessionContext.slice(0, 4).map((item) => `- ${item.title}: ${item.summary}`)

    if (trimmedNotes && trimmedNotes !== topic.trim()) {
      sections.push(`User notes:\n${trimmedNotes}`)
    }

    if (profileContext) {
      sections.push(
        `${profileContext}\nUse this only for personalization. Do not copy learner profile details verbatim into the lesson title, filenames, or on-screen equations.`
      )
    }

    if (sessionContextLines.length > 0) {
      sections.push(`Session learning context:\n${sessionContextLines.join('\n')}`)
    }

    const processFlags = [
      lessonDesign.showThinkingPath ? 'Show a compact thinking path / knowledge map before the lesson.' : null,
      lessonDesign.enableSeminar ? 'Include a multi-agent seminar moment with a mentor, a high achiever, and a struggling learner so the student moderates the discussion.' : null,
      lessonDesign.enableSimulation ? 'End with an applied simulation or scenario-based practice mission.' : null,
      lessonDesign.enableOralDefense ? 'Include an oral-defense style reflection prompt that tests reasoning, not memorization.' : null,
      lessonDesign.addDeliberateError ? 'Include one deliberate but clearly teachable mistake for the learner to audit and correct.' : null,
      lessonDesign.personalAnchor.trim() ? `Use this personal anchor or anecdote if it fits: ${lessonDesign.personalAnchor.trim()}` : null,
    ].filter(Boolean)

    if (processFlags.length > 0) {
      sections.push(`Process-first design preferences:\n- ${processFlags.join('\n- ')}`)
    }

    return sections.length > 0 ? sections.join('\n\n') : undefined
  }

  const handleInterestProfileSave = async (profile: UserInterestProfile) => {
    setProfileSaving(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch('/api/backend/users/me/profile', {
        method: 'PUT',
        headers,
        body: JSON.stringify(profile),
      })

      if (!response.ok) {
        throw new Error(`Failed to save profile: ${response.status}`)
      }

      const data = await response.json()
      setInterestProfile(data)
      setChatMessages((prev) => {
        const notice: ChatMessage = {
          id: `profile_${Date.now()}`,
          role: 'assistant',
          content: uiLanguage === 'zh'
            ? '我已经记住你的学习背景了。接下来我会优先结合你的年级、兴趣和目标来推荐主题。'
            : 'I have your learner profile now, so I can prioritize topics that better fit your level, interests, and goals.',
          timestamp: new Date(),
        }
        return [...prev, notice]
      })
    } catch (error) {
      console.error('Failed to save interest profile:', error)
      alert(uiLanguage === 'zh' ? '学习画像保存失败，请重试。' : 'Failed to save your learner profile. Please try again.')
      throw error
    } finally {
      setProfileSaving(false)
    }
  }


  // E: Run one diagnostic turn
  const runDiagnosticTurn = async (topic: string, turn: number, studentResponse: string, history: Array<{role: string; content: string}>) => {
    setDiagnosticRunning(true)
    try {
      const token = await getToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetch('/api/backend/users/me/diagnostic', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          topic,
          turn,
          student_response: studentResponse,
          history,
          language: uiLanguage === 'zh' ? 'zh' : 'en',
          ai_testing: aiTestingMode,
        }),
      })
      const data = await res.json()

      const question = data.question || ''
      const newHistory = [
        ...history,
        ...(studentResponse ? [{ role: 'user', content: studentResponse }] : []),
        { role: 'assistant', content: question },
      ]
      setDiagnosticHistory(newHistory)

      if (question) {
        setChatMessages(prev => [...prev, {
          id: `diag_${Date.now()}`,
          role: 'assistant',
          content: question,
          timestamp: new Date(),
        }])
      }

      if (data.stage === 'complete') {
        const level = data.inferred_level
        if (level === 'beginner' || level === 'intermediate' || level === 'advanced') {
          setForm(prev => ({ ...prev, studentLevel: level }))
          setChatMessages(prev => [...prev, {
            id: `diag_done_${Date.now()}`,
            role: 'assistant',
            content: uiLanguage === 'zh'
              ? `✅ 已根据你的回答推断出你的基础水平：**${level === 'beginner' ? '入门' : level === 'intermediate' ? '中级' : '进阶'}**。接下来我会基于这个级别为你定制课程路线。`
              : `✅ Based on your answers, I've set your level to **${level}**. I'll tailor the lesson roadmap accordingly.`,
            timestamp: new Date(),
          }])
        }
        setMentorStage('roadmap')
        setDiagnosticTurn(0)
      } else {
        setDiagnosticTurn(turn + 1)
      }
    } catch (err) {
      console.error('Diagnostic turn failed:', err)
      setMentorStage('roadmap')
      setDiagnosticTurn(0)
    } finally {
      setDiagnosticRunning(false)
    }
  }

  // Polling helper for background tasks (transcription, OCR)
  const pollIngestStatus = async (jobId: string, type: 'audio' | 'image') => {
    let attempts = 0;
    while (attempts < 60) { // 5 minutes max
      try {
        const res = await fetch(`/api/backend/job-status/${jobId}`);
        const statusData = await res.json();
        
        if (statusData.status === 'completed' && statusData.result) {
          return statusData.result;
        } else if (statusData.status === 'failed') {
          throw new Error(statusData.error || 'Task failed');
        }
      } catch (err) {
        console.error(`Polling ${type} error:`, err);
      }
      attempts++;
      await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('Polling timeout');
  };

  const handleAudioUpload = async (file: File) => {
    setIsUploadingAudio(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('language', 'auto')
      formData.append('display_language', uiLanguage)
      const response = await fetch('/api/backend/ingest/audio', { method: 'POST', body: formData })
      let data = await response.json()
      
      // Handle asynchronous transcription
      if (data.success && data.status === 'processing' && data.job_id) {
        setChatMessages(prev => [...prev, {
          id: `sys_wait_${Date.now()}`,
          role: 'assistant',
          content: uiLanguage === 'zh' 
            ? `⏳ 正在后台进行音频转录，请稍候...` 
            : `⏳ Transcribing audio in background, please wait...`,
          timestamp: new Date()
        }])
        
        // Start polling for result
        try {
          data = await pollIngestStatus(data.job_id, 'audio');
        } catch (pollErr) {
          console.error('Audio polling error:', pollErr);
          data = { success: false, error: 'Transcription timed out' };
        }
      }

      if (!response.ok) {
        const errorDetail = data.details || data.error || 'Unknown error'
        throw new Error(`Server error (${response.status}): ${errorDetail}`)
      }

      if (data.success && data.text) {
        // Add to context sidebar instead of just chatbox
        const newContext: LearningContext = {
          id: Date.now().toString(),
          type: 'audio',
          title: file.name,
          summary: data.summary || data.text.substring(0, 100) + '...',
          timestamp: new Date()
        }
        setSessionContext(prev => [newContext, ...prev])
        
        // Also add a system message to chat
        setChatMessages(prev => [...prev, {
          id: `sys_${Date.now()}`,
          role: 'assistant',
          content: uiLanguage === 'zh' 
            ? `🎵 已添加音频上下文 (${data.detected_language || 'auto'}): ${newContext.summary}` 
            : `🎵 Added audio context (${data.detected_language || 'auto'}): ${newContext.summary}`,
          timestamp: new Date()
        }])
      } else {
        alert(uiLanguage === 'zh' ? '音频转录失败，请重试' : 'Audio transcription failed, please try again')
      }
    } catch (err) {
      console.error('Audio upload error:', err)
      alert(uiLanguage === 'zh' ? '音频上传失败' : 'Audio upload failed')
    } finally {
      setIsUploadingAudio(false)
    }
  }

  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('language', contentLanguage)
      formData.append('display_language', uiLanguage)
      const response = await fetch('/api/backend/ingest/image', { method: 'POST', body: formData })
      let data = await response.json()

      // Handle asynchronous OCR
      if (data.success && data.status === 'processing' && data.job_id) {
        setChatMessages(prev => [...prev, {
          id: `sys_wait_img_${Date.now()}`,
          role: 'assistant',
          content: uiLanguage === 'zh' 
            ? `⏳ 正在处理图片文字识别，请稍候...` 
            : `⏳ Extracting text from image, please wait...`,
          timestamp: new Date()
        }])
        
        try {
          data = await pollIngestStatus(data.job_id, 'image');
        } catch (pollErr) {
          console.error('Image polling error:', pollErr);
          data = { success: false, error: 'OCR timed out' };
        }
      }

      if (data.success && data.text) {
        // Add to context sidebar
        const newContext: LearningContext = {
          id: Date.now().toString(),
          type: 'image',
          title: file.name,
          summary: data.summary || data.text.substring(0, 100) + '...',
          timestamp: new Date()
        }
        setSessionContext(prev => [newContext, ...prev])

        // Also add a system message to chat
        setChatMessages(prev => [...prev, {
          id: `sys_done_img_${Date.now()}`,
          role: 'assistant',
          content: uiLanguage === 'zh' 
            ? `🖼️ 已添加图片上下文: ${newContext.summary}` 
            : `🖼️ Added image context: ${newContext.summary}`,
          timestamp: new Date()
        }])
      } else {
        alert(uiLanguage === 'zh' ? '图片文字识别失败，请重试' : 'Image OCR failed, please try again')
      }
    } catch (err) {
      console.error('Image upload error:', err)
      alert(uiLanguage === 'zh' ? '图片上传失败' : 'Image upload failed')
    } finally {
      setIsUploadingImage(false)
    }
  }

  // Fetch voices on mount
  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const response = await fetch('/api/backend/voices')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.voices) {
            setVoices(data.voices)
          }
        }
      } catch (error) {
        console.error('Failed to fetch voices:', error)
      }
    }
    fetchVoices()
  }, [])


  const [pipelineProgress, setPipelineProgress] = useState<{
    currentStep: number
    totalSteps: number
    stepName: string
    stepDescription: string
    progress: number
  } | null>(null)
  const [failedStage, setFailedStage] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [pipelineStages, setPipelineStages] = useState<Array<{key: string, label: string, labelZh: string, status: 'pending' | 'active' | 'done' | 'failed'}>>([
    { key: 'syllabus', label: 'Syllabus', labelZh: '大纲', status: 'pending' },
    { key: 'script',   label: 'Script',   labelZh: '脚本', status: 'pending' },
    { key: 'audio',    label: 'Audio',    labelZh: '音频', status: 'pending' },
    { key: 'render',   label: 'Render',   labelZh: '渲染', status: 'pending' },
    { key: 'done',     label: 'Done',     labelZh: '完成', status: 'pending' },
  ])
  const realProgressRef = useRef(0)

  const suggestedTopics = useMemo(() => {
    const interestSeeds = interestProfile?.subject_interests || []
    const zhPool = ['二次函数图像', 'AP Calculus BC 导数直觉', 'Python 循环与条件', '牛顿第二定律', '概率入门', '数据可视化基础']
    const enPool = ['Quadratic functions', 'AP Calculus BC derivatives', 'Python loops and conditionals', 'Newton’s second law', 'Probability basics', 'Data visualization']

    const mapped = interestSeeds.flatMap((seed) => {
      if (seed === 'mathematics') return uiLanguage === 'zh' ? ['二次函数图像', 'AP Calculus BC 导数直觉'] : ['Quadratic functions', 'AP Calculus BC derivatives']
      if (seed === 'computer-science') return uiLanguage === 'zh' ? ['Python 循环与条件', '算法思维入门'] : ['Python loops and conditionals', 'Algorithmic thinking']
      if (seed === 'physics') return uiLanguage === 'zh' ? ['牛顿第二定律', '速度与加速度'] : ['Newton’s second law', 'Velocity and acceleration']
      return []
    })

    return Array.from(new Set([...mapped, ...(uiLanguage === 'zh' ? zhPool : enPool)])).slice(0, 6)
  }, [interestProfile?.subject_interests, uiLanguage])

  const workflowSteps = useMemo(() => ([
    {
      id: 'chatting',
      label: uiLanguage === 'zh' ? '1. 说目标' : '1. Goal',
      active: workflowPhase === 'chatting',
    },
    {
      id: 'roadmap',
      label: uiLanguage === 'zh' ? '2. 定方案' : '2. Roadmap',
      active: workflowPhase === 'roadmap',
    },
    {
      id: 'generating',
      label: uiLanguage === 'zh' ? '3. 生成并进入课程' : '3. Generate',
      active: workflowPhase === 'generating' || workflowPhase === 'preview',
    },
  ]), [uiLanguage, workflowPhase])

  // Real SSE-driven progress with smooth animation between milestones
  useEffect(() => {
    if (!generating) return

    const startTime = Date.now()
    realProgressRef.current = 0

    // Reset stages and counters on new generation
    setPipelineStages(prev => prev.map(s => ({ ...s, status: 'pending' as const })))
    setFailedStage(null)
    setElapsedSeconds(0)
    setPipelineProgress({
      currentStep: 1,
      totalSteps: 5,
      stepName: uiLanguage === 'zh' ? '正在准备...' : 'Preparing...',
      stepDescription: uiLanguage === 'zh' ? 'AI正在思考最佳教学方案...' : 'AI is thinking about the best teaching plan...',
      progress: 0
    })

    // Elapsed timer
    const timerInterval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    // Smooth animation: approach real SSE percent, never exceed it
    const smoothInterval = setInterval(() => {
      const real = realProgressRef.current
      setPipelineProgress(prev => {
        if (!prev) return prev
        const current = prev.progress
        if (current < real) {
          const next = Math.min(real, current + Math.max(0.5, (real - current) * 0.1))
          return { ...prev, progress: Math.floor(next) }
        }
        return prev
      })
    }, 300)

    return () => {
      clearInterval(timerInterval)
      clearInterval(smoothInterval)
    }
  }, [generating, uiLanguage])

  const handleGenerate = async (topicOverride?: string) => {
    const rawTopic = topicOverride || form.studentQuery

    if (!rawTopic.trim()) {
      alert(t('create.enterLearningQuestion'))
      return
    }

    const normalizeLessonText = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    const recoverRecentlyCreatedLesson = async (headers: Record<string, string>) => {
      if (!isSignedIn) {
        return null
      }

      const lessonsResponse = await fetch('/api/backend/users/me/lessons', {
        headers,
        cache: 'no-store',
      })
      if (!lessonsResponse.ok) {
        return null
      }

      const lessons = await lessonsResponse.json()
      if (!Array.isArray(lessons) || lessons.length === 0) {
        return null
      }

      const normalizedTopic = normalizeLessonText(rawTopic)
      const now = Date.now()
      const candidate = lessons.find((lesson: any) => {
        const createdAt = lesson.created_at ? new Date(lesson.created_at).getTime() : 0
        const isRecent = createdAt > 0 && now - createdAt <= 20 * 60 * 1000
        if (!isRecent) {
          return false
        }

        const lessonText = normalizeLessonText(`${lesson.title || ''} ${lesson.topic || ''}`)
        return (
          lessonText.includes(normalizedTopic) ||
          normalizedTopic.includes(lessonText)
        )
      }) || lessons[0]

      if (!candidate?.id) {
        return null
      }

      const detailResponse = await fetch(`/api/backend/lessons/${candidate.id}`, {
        headers,
        cache: 'no-store',
      })
      if (!detailResponse.ok) {
        return candidate
      }

      const detailData = await detailResponse.json()
      return detailData.lesson || candidate
    }

    setGenerating(true)

    try {
      const token = await getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const finalizeGeneration = async (result: any) => {
        // Explicitly failed result — show error, do NOT redirect anywhere
        if (result?.success === false) {
          setPipelineProgress(null)
          setWorkflowPhase('chatting')
          setGenerating(false)
          
          // More specific error messages based on error type
          let errorMessage = result.error_message || result.error || ''
          if (errorMessage.includes('Cannot connect to host api.deepseek.com') || 
              errorMessage.includes('Network error') ||
              errorMessage.includes('DEEPSEEK_API_KEY')) {
            errorMessage = uiLanguage === 'zh' 
              ? '网络连接失败或API密钥配置问题。请检查网络连接或联系管理员。'
              : 'Network connection failed or API key configuration issue. Please check your network connection or contact administrator.'
          } else if (errorMessage.includes('numpy.dtype size changed') ||
                     errorMessage.includes('binary incompatibility')) {
            errorMessage = uiLanguage === 'zh'
              ? '视频渲染环境配置问题。请联系技术支持。'
              : 'Video rendering environment configuration issue. Please contact technical support.'
          } else if (!errorMessage) {
            errorMessage = uiLanguage === 'zh' ? '未知错误，请重试。' : 'Unknown error. Please try again.'
          }
          
          alert(uiLanguage === 'zh'
            ? `课程生成失败：${errorMessage}`
            : `Lesson creation failed: ${errorMessage}`
          )
          return
        }

        if (result?.lesson_id) {
          router.push(`/lessons/${result.lesson_id}`)
          return
        }

        setPreview(result)
        setWorkflowPhase('preview')
        setPipelineProgress(null)
      }

      const response = await fetch('/api/backend/create-class', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          topic: rawTopic.trim(),
          language: uiLanguage === 'zh' ? 'zh' : 'en',
          student_level: form.studentLevel,
          duration_minutes: form.duration,
          include_video: form.includeVideo,
          include_exercises: true,
          include_assessment: true,
          voice_id: preferredVoice,
          custom_requirements: thinkingProcess || buildGenerationRequirements(rawTopic),
          syllabus: proposedSyllabus, // Pass the locked syllabus
        }),
      })

      const data = await response.json()

      if (data.job_id) {
        const pollJobUntilComplete = async (jobId: string) => {
          const maxAttempts = 240
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const statusResponse = await fetch(`/api/backend/job-status/${jobId}`, {
              cache: 'no-store',
            })
            if (!statusResponse.ok) {
              await new Promise((resolve) => setTimeout(resolve, 2000))
              continue
            }

            const statusData = await statusResponse.json()
            if (statusData.status === 'completed') {
              return statusData.result
            }
            if (statusData.success && !statusData.status) {
              return statusData
            }
            if (statusData.status === 'failed') {
              throw new Error(statusData.error || 'Job failed on the server.')
            }
            await new Promise((resolve) => setTimeout(resolve, 2000))
          }

          throw new Error('Timed out waiting for course generation to finish.')
        }

        await new Promise((resolve, reject) => {
          let settled = false
          let pollingStarted = false
          const eventSource = new EventSource(`/api/backend/job-stream/${data.job_id}`);

          const completeFromPolling = async () => {
            if (pollingStarted || settled) {
              return
            }
            pollingStarted = true
            try {
              const finalResult = await pollJobUntilComplete(data.job_id)
              if (settled) {
                return
              }
              settled = true
              
              // Only show success alert if generation actually succeeded
              if (finalResult?.success !== false) {
                alert(t('create.courseCreatedSuccess'))
              }
              
              void finalizeGeneration(finalResult)
              resolve(true)
            } catch (pollError) {
              if (!settled) {
                settled = true
                reject(pollError instanceof Error ? pollError : new Error('Connection to generation stream lost. Check server logs.'))
              }
            }
          }

          const SSE_STAGE_ORDER = ['syllabus', 'script', 'audio', 'render', 'done']
          const SSE_STAGE_KEYS: Record<string, string> = {
            syllabus_complete: 'syllabus',
            script_complete:   'script',
            audio_complete:    'audio',
            render_complete:   'render',
            done:              'done',
          }
          const SSE_STAGE_LABELS: Record<string, {en: string, zh: string}> = {
            syllabus_complete: { en: 'Syllabus Ready', zh: '大纲已完成' },
            script_complete:   { en: 'Script Ready', zh: '脚本已完成' },
            audio_complete:    { en: 'Audio Ready', zh: '音频已完成' },
            render_complete:   { en: 'Rendering Complete', zh: '渲染完成' },
          }

          eventSource.onmessage = (event) => {
            try {
              const statusData = JSON.parse(event.data);

              // Real progress milestone from Celery
              if (statusData.status === 'progress') {
                const percent = statusData.percent ?? 0
                const stage = statusData.stage ?? ''
                const completedKey = SSE_STAGE_KEYS[stage] ?? null
                realProgressRef.current = percent
                const labelInfo = SSE_STAGE_LABELS[stage]
                setPipelineProgress(prev => prev ? {
                  ...prev,
                  progress: percent,
                  stepName: labelInfo ? (uiLanguage === 'zh' ? labelInfo.zh : labelInfo.en) : prev.stepName,
                  stepDescription: statusData.label ?? prev.stepDescription,
                } : null)
                if (completedKey) {
                  setPipelineStages(prev => {
                    const cIdx = SSE_STAGE_ORDER.indexOf(completedKey)
                    return prev.map((s, i) => {
                      if (i < cIdx) return { ...s, status: 'done' as const }
                      if (s.key === completedKey) return { ...s, status: 'done' as const }
                      if (i === cIdx + 1) return { ...s, status: 'active' as const }
                      return s
                    })
                  })
                }
                return
              }

              const completedResult =
                statusData.status === 'completed'
                  ? statusData.result
                  : (statusData.success && !statusData.status ? statusData : null)

              if (completedResult) {
                settled = true
                setPipelineStages(prev => prev.map(s => ({ ...s, status: 'done' as const })))
                realProgressRef.current = 100
                setPipelineProgress(prev => prev ? { ...prev, progress: 100 } : null)
                void finalizeGeneration(completedResult);
                alert(t('create.courseCreatedSuccess'));
                eventSource.close();
                resolve(true);
              } else if (statusData.status === 'failed' || statusData.status === 'failure') {
                settled = true
                const stage = statusData.stage ?? null
                setFailedStage(stage)
                if (stage) {
                  const failKey = SSE_STAGE_KEYS[stage] ?? stage
                  setPipelineStages(prev => prev.map(s =>
                    s.key === failKey ? { ...s, status: 'failed' as const } : s
                  ))
                }
                eventSource.close();
                reject(new Error(statusData.error || 'Job failed on the server.'));
              }
            } catch (err) {
              settled = true
              eventSource.close();
              reject(err);
            }
          };

          // Start polling in parallel after a short grace period so SSE becomes an optimization, not a single point of failure.
          window.setTimeout(() => {
            void completeFromPolling()
          }, 12000)

          eventSource.onerror = () => {
            eventSource.close();
            if (settled) {
              return
            }
            void completeFromPolling()
          };
        });
      } else if (data.success) {
        await finalizeGeneration(data)
        alert(t('create.courseCreatedSuccess'))
      } else {
        setPipelineProgress(null)
        alert(t('create.creationFailed') + (data.error_message || t('create.unknownError')))
      }
    } catch (error) {
      console.error('Create failed:', error)
      setPipelineProgress(null)
      setWorkflowPhase('chatting')
      setGenerating(false)
      alert(uiLanguage === 'zh'
        ? `课程生成失败：${error instanceof Error ? error.message : '未知错误，请重试。'}`
        : `Lesson creation failed: ${error instanceof Error ? error.message : 'Unknown error. Please try again.'}`
      )
    } finally {
      setGenerating(false)
    }
  }

  const handleSendMessage = async () => {
    if (!userInput.trim()) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userInput,
      timestamp: new Date()
    }

    setChatMessages(prev => [...prev, userMessage])
    const currentInput = userInput
    setUserInput('')

    // AI Testing Mode: Skip all diagnostic and go straight to generation
    if (aiTestingMode && mentorStage === 'opening') {
      setForm(prev => ({ ...prev, studentLevel: 'beginner', studentQuery: currentInput }))
      setWorkflowPhase('generating')
      handleGenerate(currentInput)
      return
    }

    // E: If we are in the middle of a diagnostic, route to the diagnostic handler
    if (mentorStage === 'diagnostic' && diagnosticTurn >= 1) {
      await runDiagnosticTurn(diagnosticTopic, diagnosticTurn, currentInput, diagnosticHistory)
      return
    }

    setIsTyping(true)

    try {
      const response = await fetch('/api/backend/mentor/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: [...chatMessages, userMessage].map(m => ({ role: m.role, content: m.content })),
          stage: mentorStage,
          language: uiLanguage === 'zh' ? 'zh' : 'en'
        }),
      })

      const data = await response.json()

      if (data.success) {
        setMentorStage(data.stage)

        // Stream the AI response word by word
        const words = (data.content as string).split(' ')
        setStreamingContent('')
        let built = ''
        for (let i = 0; i < words.length; i++) {
          built += (i === 0 ? '' : ' ') + words[i]
          setStreamingContent(built)
          await new Promise(r => setTimeout(r, 28))
        }
        setStreamingContent(null)

        const aiResponse: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.content,
          timestamp: new Date()
        }
        setChatMessages(prev => [...prev, aiResponse])

        // E: After the user's first message in 'opening', start the diagnostic
        // if they have not completed onboarding yet
        const nextStage = data.stage
        if (nextStage === 'diagnostic' || (mentorStage === 'opening' && !interestProfile?.onboarding_completed && currentInput.trim().length >= 5)) {
          const topic = currentInput.trim()
          setDiagnosticTopic(topic)
          setMentorStage('diagnostic')
          // Kick off turn 1 immediately (no student response yet)
          await runDiagnosticTurn(topic, 1, '', [{ role: 'user', content: topic }])
          return
        }

        if (nextStage === 'roadmap' || nextStage === 'co_creation') {
          setProposedSyllabus(data.proposed_syllabus)
          setThinkingProcess(data.thinking_process)
          setNextActionLabel(data.next_action_label)
          // Store voice preference if suggested
          if (data.preferred_voice) {
            setPreferredVoice(data.preferred_voice)
          }
          setWorkflowPhase('roadmap')
        } else if (nextStage === 'diagnostic') {
          setDiagnosticQuestion(data.diagnostic_question)
        } else if (nextStage === 'locked') {
          setWorkflowPhase('generating')
          handleGenerate(proposedSyllabus?.title || currentInput)
        }
      }
    } catch (error) {
      console.error('Mentor chat failed:', error)
    } finally {
      setIsTyping(false)
    }
  }

  // Remove options-related functions as we no longer use them

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {t('nav.create')}
          </h1>
          <p className="text-gray-600 mt-1">
            {uiLanguage === 'zh' ? '更少输入，更清晰的课程生成流程。' : 'Less friction, clearer lesson generation.'}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            {t('common.remainingLessons', { count: 958 })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {workflowSteps.map((step) => (
          <div
            key={step.id}
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              step.active
                ? 'border-blue-300 bg-blue-50 text-blue-900'
                : 'border-gray-200 bg-white text-gray-500'
            }`}
          >
            {step.label}
          </div>
        ))}
      </div>

      <div className="w-full">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Interface Area */}
          <div className={`${sessionContext.length > 0 ? 'lg:col-span-3' : 'lg:col-span-4'} space-y-6 transition-all duration-300`}>
            {workflowPhase === 'chatting' && (
              <InterestProfileQuiz
                language={uiLanguage}
                isSignedIn={!!isSignedIn}
                isLoading={!authLoaded || profileLoading}
                isSaving={profileSaving}
                profile={interestProfile}
                onSave={handleInterestProfileSave}
              />
            )}
            
            {workflowPhase === 'chatting' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {t('create.chatTitle')}
                </h2>
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {uiLanguage === 'zh' ? '快速开始' : 'Quick Start'}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {suggestedTopics.map((topic) => (
                        <button
                          key={topic}
                          type="button"
                          onClick={() => {
                            if (aiTestingMode) {
                              // Direct generation mode - skip diagnostic
                              setForm(prev => ({ ...prev, studentLevel: 'beginner', studentQuery: topic }))
                              setWorkflowPhase('generating')
                              handleGenerate(topic)
                            } else {
                              // Normal mode - set input for chat
                              setUserInput(topic)
                            }
                          }}
                          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                            aiTestingMode 
                              ? 'border-yellow-300 bg-yellow-50 text-yellow-700 hover:border-yellow-400 hover:bg-yellow-100' 
                              : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700'
                          }`}
                        >
                          {aiTestingMode && '⚡ '}{topic}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-[550px] overflow-y-auto space-y-4 p-4 bg-gray-50/50 rounded-lg">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-4 ${message.role === 'user'
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-gray-100 text-gray-900'
                            }`}
                        >
                          <div className="text-sm font-medium mb-1">
                            {message.role === 'user' ? t('create.userName') : t('create.assistantName')}
                          </div>
                          <MentorMessage content={message.content} />
                          <div className="text-xs text-gray-500 mt-2">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    ))}

                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 text-gray-900 rounded-lg p-4 max-w-[80%]">
                          <div className="text-sm font-medium mb-1">{t('create.assistantName')}</div>
                          {streamingContent !== null ? (
                            <MentorMessage content={streamingContent + ' ▍'} />
                          ) : (
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* AI Testing Mode Toggle */}
                    {(mentorStage === 'opening' || mentorStage === 'diagnostic') && (
                      <div className="flex justify-center py-2">
                        <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
                          <span className="text-xs font-medium text-yellow-700">
                            {uiLanguage === 'zh' ? 'AI测试模式' : 'AI Testing Mode'}
                          </span>
                          <button
                            onClick={() => setAiTestingMode(!aiTestingMode)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              aiTestingMode ? 'bg-yellow-500' : 'bg-gray-200'
                            }`}
                          >
                            <span className="sr-only">
                              {uiLanguage === 'zh' ? 'AI测试模式' : 'AI Testing Mode'}
                            </span>
                            <span
                              className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                                aiTestingMode ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <span className="text-xs text-yellow-600">
                            {aiTestingMode 
                              ? (uiLanguage === 'zh' ? '⚡ 点击直接生成课程' : '⚡ Click topics to generate instantly')
                              : (uiLanguage === 'zh' ? '正常诊断流程' : 'Normal diagnostic flow')
                            }
                          </span>
                        </div>
                      </div>
                    )}

                    {/* E: Diagnostic progress indicator */}
                    {mentorStage === 'diagnostic' && diagnosticTurn >= 1 && (
                      <div className="flex justify-center py-2">
                        <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-full px-3 py-1.5">
                          {diagnosticRunning
                            ? <span className="animate-pulse">{uiLanguage === 'zh' ? '正在评估...' : 'Diagnosing...'}</span>
                            : (
                              <>
                                <span>{uiLanguage === 'zh' ? '基础诊断' : 'Level check'}</span>
                                {[1, 2, 3].map(n => (
                                  <div
                                    key={n}
                                    className={`w-2 h-2 rounded-full ${diagnosticTurn > n ? 'bg-blue-500' : diagnosticTurn === n ? 'bg-blue-300 animate-pulse' : 'bg-gray-200'}`}
                                  />
                                ))}
                                <span className="text-blue-600">{diagnosticTurn}/3</span>
                              </>
                            )
                          }
                        </div>
                      </div>
                    )}

                    <div ref={chatEndRef} />
                  </div>

                  <div className="flex gap-2 items-center">
                    <label
                      title={uiLanguage === 'zh' ? '上传音频（FunASR转录）' : 'Upload audio (FunASR transcription)'}
                      className={`p-3 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors flex items-center justify-center ${isUploadingAudio ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        disabled={isUploadingAudio}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioUpload(f); e.target.value = '' }}
                      />
                      {isUploadingAudio ? (
                        <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                      ) : (
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      )}
                    </label>

                    <label
                      title={uiLanguage === 'zh' ? '上传图片/文档（PaddleOCR识别）' : 'Upload image/doc (PaddleOCR)'}
                      className={`p-3 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors flex items-center justify-center ${isUploadingImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        disabled={isUploadingImage}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }}
                      />
                      {isUploadingImage ? (
                        <div className="animate-spin w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full" />
                      ) : (
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      )}
                    </label>

                    <input
                      type="text"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder={t('create.chatPlaceholder')}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!userInput.trim() || isTyping}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('create.sendButton')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {workflowPhase === 'roadmap' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
                <div className="flex items-center space-x-2 text-blue-600 mb-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <h2 className="text-lg font-semibold">{uiLanguage === 'zh' ? '导师的思考过程' : "Mentor's Thinking Process"}</h2>
                </div>
                
                {thinkingProcess && (
                  <div className="bg-blue-50 border-l-4 border-blue-400 p-4 italic text-gray-700 text-sm">
                    {thinkingProcess}
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-gray-900">{proposedSyllabus?.title || (uiLanguage === 'zh' ? '你的个性化学习路线' : 'Your Personalized Roadmap')}</h3>
                  
                  <div className="relative border-l-2 border-blue-200 ml-4 pl-8 space-y-10">
                    {proposedSyllabus?.chapters?.map((chapter: any, idx: number) => (
                      <div key={idx} className="relative group">
                        <div className="absolute -left-[41px] top-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg group-hover:scale-110 transition-transform">
                          {idx + 1}
                        </div>
                        <div className="bg-slate-50 rounded-lg p-4 hover:bg-slate-100 transition-colors border border-slate-200 shadow-sm">
                          <h4 className="font-bold text-gray-900 text-lg">{chapter.title}</h4>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <div className="flex items-center space-x-1.5 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              <span>{chapter.visual}</span>
                            </div>
                            <div className="flex items-center space-x-1.5 bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>{chapter.goal}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col space-y-3 pt-4 border-t border-gray-100">
                  <button
                    onClick={() => {
                      const topic = proposedSyllabus?.title
                        || chatMessages.find(m => m.role === 'user')?.content
                        || ''
                      setWorkflowPhase('generating')
                      handleGenerate(topic)
                    }}
                    className="w-full bg-blue-600 text-white rounded-lg py-3 font-semibold hover:bg-blue-700 transition-colors shadow-md"
                  >
                    {nextActionLabel || (uiLanguage === 'zh' ? '这就是我想要的，开始生成！' : "This is exactly what I want, let's go!")}
                  </button>
                  <div className="text-center">
                    <button 
                      onClick={() => setWorkflowPhase('chatting')}
                      className="text-sm text-gray-500 hover:text-blue-600 transition-colors underline underline-offset-4"
                    >
                      {uiLanguage === 'zh' ? '不完全是？在聊天中调整方案' : "Not quite? Adjust the plan in chat"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(workflowPhase === 'generating' || workflowPhase === 'preview') && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                {generating ? (
                  <div className="py-8 max-w-md mx-auto">
                    {failedStage ? (
                      /* ── Error state ── */
                      <div className="text-center">
                        <div className="text-4xl mb-3">⚠️</div>
                        <div className="text-lg font-semibold text-red-600 mb-2">
                          {uiLanguage === 'zh' ? '生成失败' : 'Generation Failed'}
                        </div>
                        <div className="text-sm text-gray-500 mb-4 leading-relaxed">
                          {uiLanguage === 'zh'
                            ? <>在 <strong>{pipelineStages.find(s => s.key === (failedStage?.replace('_complete','') ?? failedStage))?.labelZh ?? failedStage}</strong> 阶段出错，请重试。</>
                            : <>Something went wrong during <strong>{pipelineStages.find(s => s.key === (failedStage?.replace('_complete','') ?? failedStage))?.label ?? failedStage}</strong>. Please try again.</>
                          }
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5 text-sm text-center text-red-900">
                          {uiLanguage === 'zh' ? '该阶段失败，请重试。' : 'This stage failed. Please try again.'}
                        </div>
                        {/* Stage pipeline showing failure point */}
                        <div className="flex justify-between items-start mb-5 text-xs">
                          {pipelineStages.map((stage, i) => (
                            <div key={stage.key} className="flex items-start" style={{flex: 1}}>
                              <div className="flex flex-col items-center w-full">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1
                                  ${stage.status === 'done'   ? 'bg-green-500 text-white' : ''}
                                  ${stage.status === 'failed' ? 'bg-red-600 text-white' : ''}
                                  ${stage.status === 'pending'? 'bg-gray-200 text-gray-400' : ''}
                                `}>
                                  {stage.status === 'done'    ? '✓' : stage.status === 'failed' ? '✗' : String(i + 1)}
                                </div>
                                <div className={stage.status === 'failed' ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                                  {uiLanguage === 'zh' ? stage.labelZh : stage.label}
                                </div>
                              </div>
                              {i < pipelineStages.length - 1 && (
                                <div className="flex items-center pb-5 flex-1">
                                  <div className={`h-0.5 w-full ${pipelineStages[i].status === 'done' ? 'bg-green-500' : 'bg-gray-200'}`} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-3">
                          <button
                            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-700 transition-colors"
                            onClick={() => {
                              setFailedStage(null)
                              setPipelineStages(prev => prev.map(s => ({ ...s, status: 'pending' as const })))
                              setPipelineProgress(null)
                              setElapsedSeconds(0)
                              handleGenerate(form.studentQuery)
                            }}
                          >
                            {uiLanguage === 'zh' ? '🔄 重试' : '🔄 Try Again'}
                          </button>
                          <button
                            className="px-4 py-2.5 bg-white text-gray-500 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                            onClick={() => {
                              setFailedStage(null)
                              setGenerating(false)
                              setPipelineStages(prev => prev.map(s => ({ ...s, status: 'pending' as const })))
                              setPipelineProgress(null)
                            }}
                          >
                            {uiLanguage === 'zh' ? '取消' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── In-progress state ── */
                      <div>
                        <div className="text-center mb-5">
                          <div className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                            {uiLanguage === 'zh' ? '正在生成课程' : 'GENERATING YOUR LESSON'}
                          </div>
                          <div className="text-4xl font-bold text-blue-600">{pipelineProgress?.progress || 0}%</div>
                          <div className="text-sm font-medium text-gray-700 mt-1">
                            {pipelineProgress?.stepName || (uiLanguage === 'zh' ? '正在准备...' : 'Preparing...')}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {pipelineProgress?.stepDescription || (uiLanguage === 'zh' ? 'AI正在思考最佳教学方案...' : 'AI is thinking about the best teaching plan...')}
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="bg-gray-200 rounded-lg h-2.5 my-4 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-lg transition-all duration-300"
                            style={{ width: `${pipelineProgress?.progress || 0}%` }}
                          />
                        </div>
                        {/* Stage pipeline */}
                        <div className="flex justify-between items-start my-4 text-xs">
                          {pipelineStages.map((stage, i) => (
                            <div key={stage.key} className="flex items-start" style={{flex: 1}}>
                              <div className="flex flex-col items-center w-full">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1
                                  ${stage.status === 'done'   ? 'bg-green-500 text-white' : ''}
                                  ${stage.status === 'active' ? 'bg-blue-500 text-white animate-pulse' : ''}
                                  ${stage.status === 'failed' ? 'bg-red-600 text-white' : ''}
                                  ${stage.status === 'pending'? 'bg-gray-200 text-gray-400' : ''}
                                `}>
                                  {stage.status === 'done'    ? '✓' : ''}
                                  {stage.status === 'active'  ? '⟳' : ''}
                                  {stage.status === 'failed'  ? '✗' : ''}
                                  {stage.status === 'pending' ? String(i + 1) : ''}
                                </div>
                                <div className={`text-center
                                  ${stage.status === 'active'  ? 'text-blue-500 font-semibold' : ''}
                                  ${stage.status === 'failed'  ? 'text-red-600 font-semibold' : ''}
                                  ${stage.status !== 'active' && stage.status !== 'failed' ? 'text-gray-400' : ''}
                                `}>
                                  {uiLanguage === 'zh' ? stage.labelZh : stage.label}
                                </div>
                              </div>
                              {i < pipelineStages.length - 1 && (
                                <div className="flex items-center pb-5 flex-1">
                                  <div className={`h-0.5 w-full
                                    ${pipelineStages[i].status === 'done'   ? 'bg-green-500' : ''}
                                    ${pipelineStages[i].status === 'active' ? 'bg-blue-400' : ''}
                                    ${pipelineStages[i].status !== 'done' && pipelineStages[i].status !== 'active' ? 'bg-gray-200' : ''}
                                  `} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {/* Elapsed timer */}
                        <div className="flex justify-between text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
                          <span>
                            ⏱ {uiLanguage === 'zh' ? '已运行' : 'Running for'}{' '}
                            <strong>{Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s</strong>
                          </span>
                          <span>
                            {uiLanguage === 'zh' ? '预计还需' : 'Est. remaining:'}{' '}
                            <strong>~{Math.max(0, Math.round((215 - elapsedSeconds) / 60))}m</strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : preview ? (
                  <div className="space-y-8">
                    <div className="rounded-xl border border-green-200 bg-green-50 p-6">
                      <div className="text-sm font-semibold uppercase tracking-wide text-green-700">
                        {uiLanguage === 'zh' ? '课程已生成' : 'Lesson Ready'}
                      </div>
                      <h2 className="mt-2 text-2xl font-bold text-green-900">
                        {preview.class_title || preview.topic || (uiLanguage === 'zh' ? '新课程' : 'New Lesson')}
                      </h2>
                      <p className="mt-2 text-sm text-green-800">
                        {preview.class_description || preview.lesson_plan?.overview || (uiLanguage === 'zh'
                          ? '课程已自动保存，系统通常会直接带你进入正式课程页。'
                          : 'The lesson is already saved and the app will usually take you directly into the lesson room.')}
                      </p>
                    </div>

                    {preview.video_url ? (
                      <div className="rounded-xl overflow-hidden shadow-lg bg-black aspect-video relative group">
                        <video key={preview.video_url} controls className="w-full h-full" preload="metadata">
                          <source src={preview.video_url.startsWith('http') ? preview.video_url : `/api/backend/media${preview.video_url.startsWith('/') ? '' : '/'}${preview.video_url}`} type="video/mp4" />
                        </video>
                      </div>
                    ) : (
                      <div className="aspect-video bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                        <p className="text-gray-500">🎥 {uiLanguage === 'zh' ? '视频生成未包含或失败' : 'Video failed'}</p>
                      </div>
                    )}

                    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                      <div className="space-y-6">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                          <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                            {uiLanguage === 'zh' ? '课程概览' : 'Lesson Overview'}
                          </div>
                          <p className="mt-3 text-sm leading-7 text-slate-700">
                            {preview.lesson_plan?.overview || preview.class_description || '—'}
                          </p>
                        </div>

                        {Array.isArray(preview.learning_objectives) && preview.learning_objectives.length > 0 && (
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">
                              {uiLanguage === 'zh' ? '学习目标' : 'Learning Objectives'}
                            </h3>
                            <div className="mt-4 space-y-2">
                              {preview.learning_objectives.slice(0, 6).map((item: string, index: number) => (
                                <div key={`${item}-${index}`} className="rounded-lg bg-white border border-slate-200 p-4 text-sm text-slate-700">
                                  • {item}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {Array.isArray(preview.lesson_plan?.chapters) && preview.lesson_plan.chapters.length > 0 && (
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">
                              {uiLanguage === 'zh' ? '课程流程' : 'Lesson Flow'}
                            </h3>
                            <div className="mt-4 space-y-3">
                              {preview.lesson_plan.chapters.slice(0, 8).map((chapter: any, index: number) => (
                                <div key={chapter.id || `${chapter.title}-${index}`} className="rounded-xl border border-slate-200 bg-white p-5">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        {uiLanguage === 'zh' ? `部分 ${index + 1}` : `Part ${index + 1}`}
                                      </div>
                                      <div className="mt-1 text-base font-semibold text-slate-900">
                                        {chapter.title || chapter.learning_goal || chapter.id}
                                      </div>
                                    </div>
                                    {chapter.duration_minutes && (
                                      <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
                                        {chapter.duration_minutes} {uiLanguage === 'zh' ? '分钟' : 'min'}
                                      </div>
                                    )}
                                  </div>
                                  <p className="mt-3 text-sm leading-7 text-slate-700">
                                    {chapter.summary || chapter.content || chapter.learning_goal || '—'}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-6">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                          <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                            {uiLanguage === 'zh' ? '完整讲稿' : 'Full Transcript'}
                          </div>
                          <div className="mt-3 max-h-[520px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 font-mono text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                            {preview.ai_insights?.full_transcript || preview.full_transcript || preview.ai_insights?.script?.script_text || '—'}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                          {uiLanguage === 'zh'
                            ? '课程已自动保存。通常会直接跳转到正式课程页；如果没有跳转，也可以去 Lessons 查看。'
                            : 'The lesson is already saved. Usually you will be redirected to the lesson room; if not, you can still open it from Lessons.'}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Sidebar Area: Learning Context */}
          {sessionContext.length > 0 && (
            <div className="lg:col-span-1 space-y-4 animate-fade-in transition-all duration-300">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sticky top-4 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <h3 className="font-bold text-gray-900 border-b-2 border-blue-500 pb-1">
                    {uiLanguage === 'zh' ? '学习上下文' : 'Learning Context'}
                  </h3>
                  <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">
                    {sessionContext.length}
                  </span>
                </div>
                
                <div className="space-y-3 overflow-y-auto px-1 flex-grow scrollbar-thin">
                  {sessionContext.map((ctx) => (
                    <SessionContextCard
                      key={ctx.id}
                      type={ctx.type}
                      title={ctx.title}
                      summary={ctx.summary}
                      timestamp={ctx.timestamp}
                      onRemove={() => setSessionContext(prev => prev.filter(c => c.id !== ctx.id))}
                    />
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 italic text-[10px] text-gray-400 flex-shrink-0 text-center">
                  {uiLanguage === 'zh' 
                    ? '上传图片或音频来丰富背景信息。' 
                    : 'Upload media for more context.'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
