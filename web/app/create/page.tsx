'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '../components/LanguageContext'
import { useAuth } from '@clerk/nextjs'
import { translations } from '../lib/translations'
import SessionContextCard from '../components/Chat/SessionContextCard'
import InterestProfileQuiz, { UserInterestProfile } from '../components/InterestProfileQuiz'

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

export default function CreateLessonPage() {
  const router = useRouter()
  const { language: uiLanguage, contentLanguage, t } = useLanguage()
  const { getToken, isLoaded: authLoaded, isSignedIn } = useAuth()
  const [workflowPhase, setWorkflowPhase] = useState<'chatting' | 'topic-selection' | 'generating' | 'preview'>('chatting')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [interestProfile, setInterestProfile] = useState<UserInterestProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)

  // Initialize chat message based on language
  useEffect(() => {
    if (chatMessages.length === 0) {
      setChatMessages([
        {
          id: '1',
          role: 'assistant',
          content: uiLanguage === 'zh'
            ? '你好！我是你的AI学习导师。请告诉我你想学习什么，或者在学习中遇到了什么困难？我会通过对话了解你的需求，然后为你推荐最适合的学习主题。'
            : 'Hello! I am your AI learning mentor. Please tell me what you want to learn, or what difficulties you are having in your studies? I will understand your needs through conversation and then recommend the most suitable learning topics for you.',
          timestamp: new Date()
        }
      ])
    }
  }, [uiLanguage, chatMessages.length])

  const [userInput, setUserInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [identifiedTopics, setIdentifiedTopics] = useState<IdentifiedTopic[]>([])
  const [selectedTopics, setSelectedTopics] = useState<string[]>([])
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

  // Audio/Image upload state
  const [isUploadingAudio, setIsUploadingAudio] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [sessionContext, setSessionContext] = useState<LearningContext[]>([])
  
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

  const addProfileContextToPrompt = (prompt: string) => {
    const profileContext = buildProfilePromptContext(interestProfile)
    if (!profileContext) {
      return prompt
    }
    return `${prompt}\n\n${profileContext}`
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

  const handleAudioUpload = async (file: File) => {
    setIsUploadingAudio(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('language', contentLanguage)
      const response = await fetch('/api/backend/ingest/audio', { method: 'POST', body: formData })
      let data = await response.json()
      
      // Handle asynchronous transcription for long files
      if (data.success && data.status === 'processing' && data.job_id) {
        setChatMessages(prev => [...prev, {
          id: `sys_wait_${Date.now()}`,
          role: 'assistant',
          content: uiLanguage === 'zh' 
            ? `⏳ 检测到较长文件，正在后台进行转录，请稍候...` 
            : `⏳ Long file detected. Transcribing in background, please wait...`,
          timestamp: new Date()
        }])
        
        let attempts = 0
        const maxAttempts = 600 // 20 minutes with 2s interval
        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 2000))
          const pollRes = await fetch(`/api/backend/job-status/${data.job_id}`)
          const pollData = await pollRes.json()
          
          if (pollData.success && pollData.text) {
            data = pollData
            break
          } else if (pollData.status === 'failed') {
            throw new Error(pollData.error || 'Transcription failed')
          }
          
          // Add status update every 30 seconds
          if (attempts > 0 && attempts % 15 === 0) {
            setChatMessages(prev => [...prev, {
              id: `sys_wait_update_${Date.now()}`,
              role: 'assistant',
              content: uiLanguage === 'zh' 
                ? `仍正在转录较大文件，请继续耐心等待...` 
                : `Still transcribing large file, please continue to wait...`,
              timestamp: new Date()
            }])
          }
          attempts++
        }
        
        if (attempts >= maxAttempts) {
          throw new Error('Transcription timed out')
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
            ? `🎵 已添加音频上下文: ${newContext.summary}` 
            : `🎵 Added audio context: ${newContext.summary}`,
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
      const response = await fetch('/api/backend/ingest/image', { method: 'POST', body: formData })
      const data = await response.json()
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
          id: `sys_${Date.now()}`,
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

  // Simulated progress effect
  useEffect(() => {
    if (!generating) return

    const steps = [
      { name: uiLanguage === 'zh' ? '分析需求' : 'Analyzing Request', desc: uiLanguage === 'zh' ? '理解您的学习目标...' : 'Understanding your learning goals...' },
      { name: uiLanguage === 'zh' ? '构建知识图谱' : 'Building Knowledge Graph', desc: uiLanguage === 'zh' ? '连接相关概念...' : 'Connecting related concepts...' },
      { name: uiLanguage === 'zh' ? '编写脚本' : 'Drafting Script', desc: uiLanguage === 'zh' ? '生成教学大纲和脚本...' : 'Generating syllabus and script...' },
      { name: uiLanguage === 'zh' ? '合成语音' : 'Synthesizing Audio', desc: uiLanguage === 'zh' ? '生成AI教师语音...' : 'Generating AI teacher voice...' },
      { name: uiLanguage === 'zh' ? '渲染视频' : 'Rendering Video', desc: uiLanguage === 'zh' ? '生成动态教学视频 (可能需要1-2分钟)...' : 'Generating dynamic teaching video (may take 1-2 mins)...' },
    ]

    let stepIndex = 0
    let progressValue = 10

    // Initial state
    setPipelineProgress({
      currentStep: 1,
      totalSteps: steps.length,
      stepName: steps[0].name,
      stepDescription: steps[0].desc,
      progress: progressValue
    })

    const interval = setInterval(() => {
      progressValue += (99 - progressValue) * 0.02
      const estimatedStep = Math.floor((progressValue / 100) * steps.length)
      if (estimatedStep > stepIndex && estimatedStep < steps.length) {
        stepIndex = estimatedStep
      }

      setPipelineProgress({
        currentStep: stepIndex + 1,
        totalSteps: steps.length,
        stepName: steps[stepIndex].name,
        stepDescription: steps[stepIndex].desc,
        progress: Math.floor(progressValue)
      })
    }, 500)

    return () => clearInterval(interval)
  }, [generating, uiLanguage])

  const handleGenerate = async (topicOverride?: string) => {
    const rawTopic = topicOverride || form.studentQuery
    const topicToUse = addProfileContextToPrompt(rawTopic)

    if (!rawTopic.trim()) {
      alert(t('create.enterLearningQuestion'))
      return
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

      const response = await fetch('/api/backend/create-class', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          topic: topicToUse,
          language: contentLanguage,
          studentLevel: form.studentLevel,
          durationMinutes: form.duration,
          includeVideo: form.includeVideo,
          includeExercises: true,
          includeAssessment: true,
          voiceId: form.voiceId
        }),
      })

      const data = await response.json()

      if (data.job_id) {
        await new Promise((resolve, reject) => {
          const eventSource = new EventSource(`/api/backend/job-stream/${data.job_id}`);

          eventSource.onmessage = (event) => {
            try {
              const statusData = JSON.parse(event.data);
              if (statusData.status === 'completed') {
                setPreview(statusData.result);
                setPipelineProgress(null);
                alert(t('create.courseCreatedSuccess'));
                eventSource.close();
                resolve(true);
              } else if (statusData.status === 'failed') {
                eventSource.close();
                reject(new Error(statusData.error || 'Job failed on the server.'));
              }
            } catch (err) {
              eventSource.close();
              reject(err);
            }
          };

          eventSource.onerror = (error) => {
            eventSource.close();
            reject(new Error('Connection to generation stream lost. Check server logs.'));
          };
        });
      } else if (data.success) {
        setPreview(data)
        setPipelineProgress(null)
        alert(t('create.courseCreatedSuccess'))
      } else {
        setPipelineProgress(null)
        alert(t('create.creationFailed') + (data.error_message || t('create.unknownError')))
      }
    } catch (error) {
      console.error('Create failed:', error)
      setPipelineProgress(null)
      alert(t('create.creationFailedRetry'))
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
    setUserInput('')
    setIsTyping(true)

    const aiResponse: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: uiLanguage === 'zh'
        ? `我理解了你想学习"${userInput}"。让我为你分析一下这个主题，并推荐最相关的学习内容...`
        : `I understand you want to learn about "${userInput}". Let me analyze this topic for you and recommend the most relevant learning content...`,
      timestamp: new Date()
    }

    setChatMessages(prev => [...prev, aiResponse])

    try {
      const token = await getToken()
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch('/api/backend/analyze-topics', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          studentQuery: userInput,
          language: contentLanguage,
        }),
      })

      const data = await response.json()

      if (data.success) {
        const analyzedTopics: IdentifiedTopic[] = data.topics.map((topic: any, index: number) => ({
          id: topic.id || `topic_${index + 1}`,
          name: topic.name_en || topic.name,
          name_zh: topic.name_zh || topic.name,
          name_en: topic.name_en || topic.name,
          description: topic.description_en || topic.description,
          description_zh: topic.description_zh || topic.description,
          description_en: topic.description_en || topic.description,
          confidence: topic.confidence || 0.8,
          icon: '',
          category: topic.category || 'general',
          follow_up_questions: topic.follow_up_questions_en || topic.follow_up_questions || [],
          follow_up_questions_zh: topic.follow_up_questions_zh || topic.follow_up_questions || [],
          follow_up_questions_en: topic.follow_up_questions_en || topic.follow_up_questions || []
        }))

        setIdentifiedTopics(analyzedTopics)

        const analysisCompleteMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: uiLanguage === 'zh'
            ? `分析完成！我为你找到了 ${analyzedTopics.length} 个相关学习主题。请选择你感兴趣的主题：`
            : `Analysis complete! I found ${analyzedTopics.length} relevant learning topics for you. Please select the topics you're interested in:`,
          timestamp: new Date()
        }

        setChatMessages(prev => [...prev, analysisCompleteMessage])
        setWorkflowPhase('topic-selection')
      } else {
        const errorMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: t('create.analysisFailed'),
          timestamp: new Date()
        }
        setChatMessages(prev => [...prev, errorMessage])
        setWorkflowPhase('topic-selection')
      }
    } catch (error) {
      console.error('Topic analysis failed:', error)
      setIsTyping(false)
    } finally {
      setIsTyping(false)
    }
  }

  const handleTopicSelect = (topicId: string) => {
    if (selectedTopics.includes(topicId)) {
      setSelectedTopics(prev => prev.filter(id => id !== topicId))
    } else {
      setSelectedTopics(prev => [...prev, topicId])
    }
  }

  const handleConfirmTopics = () => {
    if (selectedTopics.length === 0) {
      alert(t('create.selectAtLeastOneTopic'))
      return
    }

    const selectedTopicNames = identifiedTopics
      .filter(topic => selectedTopics.includes(topic.id))
      .map(topic => topic.name)
      .join(', ')

    const fullTopicQuery = form.studentQuery && form.studentQuery !== ''
      ? `${selectedTopicNames}. Additional requirements: ${form.studentQuery}`
      : selectedTopicNames

    setForm(prev => ({
      ...prev,
      studentQuery: fullTopicQuery
    }))

    setWorkflowPhase('generating')
    handleGenerate(fullTopicQuery)
  }

  const handleSave = () => {
    if (!preview) {
      alert(t('create.generateCourseFirst'))
      return
    }
    alert(t('create.courseSaved'))
    router.push('/lessons')
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {t('nav.create')}
          </h1>
          <p className="text-gray-600 mt-1">
            {uiLanguage === 'zh' ? 'AI驱动的个性化教学课程生成' : 'AI-powered personalized teaching course generation'}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            {t('common.remainingLessons', { count: 958 })}
          </div>
        </div>
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
                          <div className="text-sm">{message.content}</div>
                          <div className="text-xs text-gray-500 mt-2">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    ))}

                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 text-gray-900 rounded-lg p-4">
                          <div className="text-sm font-medium mb-1">{t('create.assistantName')}</div>
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        </div>
                      </div>
                    )}
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

            {workflowPhase === 'topic-selection' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {t('create.topicSelectionTitle')}
                </h2>
                <div className="space-y-6">
                  <p className="text-gray-600">
                    {uiLanguage === 'zh' ? '请选择一个最感兴趣的学习主题：' : 'Please select the topic you are most interested in:'}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
                    {identifiedTopics.map((topic) => (
                      <button
                        key={topic.id}
                        onClick={() => setSelectedTopics([topic.id])}
                        className={`p-6 rounded-xl border-2 text-left transition-all h-full flex flex-col min-h-[280px] ${selectedTopics.includes(topic.id)
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-md'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 hover:shadow-sm'
                          }`}
                      >
                        <div className="font-bold text-gray-900 text-xl mb-3 line-clamp-2 min-h-[3.5rem]">
                          {uiLanguage === 'zh' ? (topic.name_zh || topic.name) : (topic.name_en || topic.name)}
                        </div>
                        <div className="text-base text-gray-600 flex-grow leading-relaxed line-clamp-6">
                          {uiLanguage === 'zh' ? (topic.description_zh || topic.description) : (topic.description_en || topic.description)}
                        </div>
                      </button>
                    ))}
                  </div>

                  {selectedTopics.length > 0 && (
                    <div className="mt-8 bg-gray-50 rounded-xl p-6 border border-gray-200 animate-fade-in">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {uiLanguage === 'zh' ? '选择AI讲师声音' : 'Select AI Instructor Voice'}
                          </label>
                          <select
                            value={form.voiceId}
                            onChange={(e) => setForm({ ...form, voiceId: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                          >
                            {voices.map((voice) => (
                              <option key={voice.id} value={voice.id}>
                                {voice.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {uiLanguage === 'zh' ? '补充具体要求 (可选)' : 'Additional Requirements (Optional)'}
                          </label>
                          <textarea
                            value={form.studentQuery}
                            onChange={(e) => setForm({ ...form, studentQuery: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-[50px] min-h-[50px]"
                            rows={1}
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={handleConfirmTopics}
                          className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-bold hover:shadow-lg hover:scale-105 transition-all transform"
                        >
                          {uiLanguage === 'zh' ? '开始生成课程 ✨' : 'Start Generating Lesson ✨'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-start pt-4 border-t">
                    <button
                      onClick={() => setWorkflowPhase('chatting')}
                      className="text-gray-500 hover:text-gray-700 font-medium px-4 py-2"
                    >
                      {t('create.backToChatButton')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(workflowPhase === 'generating' || workflowPhase === 'preview') && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                {generating ? (
                  <div className="py-12 text-center space-y-8">
                    <div className="relative w-32 h-32 mx-auto">
                      <div className="absolute inset-0 rounded-full border-4 border-gray-100"></div>
                      <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-bold text-blue-600">{pipelineProgress?.progress || 0}%</span>
                      </div>
                    </div>
                    <div className="max-w-md mx-auto">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        {pipelineProgress?.stepName || (uiLanguage === 'zh' ? '正在准备...' : 'Preparing...')}
                      </h3>
                      <p className="text-gray-500 animate-pulse">
                        {pipelineProgress?.stepDescription || (uiLanguage === 'zh' ? 'AI正在思考最佳教学方案...' : 'AI is thinking about the best teaching plan...')}
                      </p>
                    </div>
                  </div>
                ) : preview ? (
                  <div className="space-y-8">
                    <div className="bg-green-50 rounded-xl p-6 border border-green-200 flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-green-800 mb-1">
                          {uiLanguage === 'zh' ? '课程生成完成！' : 'Lesson Generation Complete!'}
                        </h2>
                        <p className="text-green-700">
                          {uiLanguage === 'zh' ? '您的个性化AI视频课程已准备就绪。' : 'Your personalized AI video lesson is ready.'}
                        </p>
                      </div>
                      <div className="bg-white p-3 rounded-full shadow-sm">
                        <span className="text-4xl">🎉</span>
                      </div>
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

                    <div className="flex justify-end pt-6 border-t">
                      <button onClick={handleSave} className="px-8 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg">
                        {t('create.saveCourseButton')}
                      </button>
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
