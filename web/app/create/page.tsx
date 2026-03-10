'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '../components/LanguageContext'
import { translations } from '../lib/translations'

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

export default function CreateLessonPage() {
  const router = useRouter()
  const { language: uiLanguage, contentLanguage, t } = useLanguage()
  const [workflowPhase, setWorkflowPhase] = useState<'chatting' | 'topic-selection' | 'generating' | 'preview'>('chatting')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])

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
  const audioInputRef = useState<HTMLInputElement | null>(null)
  const imageInputRef = useState<HTMLInputElement | null>(null)

  const handleAudioUpload = async (file: File) => {
    setIsUploadingAudio(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('language', contentLanguage)
      const response = await fetch('/api/backend/ingest/audio', { method: 'POST', body: formData })
      const data = await response.json()
      if (data.success && data.text) {
        setUserInput(prev => prev ? `${prev} ${data.text}` : data.text)
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
        setUserInput(prev => prev ? `${prev}\n${data.text}` : data.text)
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
      // Asymptotic approach to 99%
      progressValue += (99 - progressValue) * 0.02

      // Advance step every ~3-5 seconds roughly
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
    const topicToUse = topicOverride || form.studentQuery

    if (!topicToUse.trim()) {
      alert(t('create.enterLearningQuestion'))
      return
    }

    setGenerating(true)
    // Pipeline progress handled by effect

    try {
      const response = await fetch('/api/backend/create-class', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
        // Poll via the Next.js proxy route (avoids CORS issues in production)
        let isComplete = false;
        let pollCount = 0;
        const MAX_POLLS = 120; // 10 minutes max (120 * 5s)

        while (!isComplete && pollCount < MAX_POLLS) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          pollCount++;

          try {
            const statusRes = await fetch(`/api/backend/job-status/${data.job_id}`);

            if (!statusRes.ok) {
              console.warn(`[poll ${pollCount}] job-status returned HTTP ${statusRes.status}, retrying...`);
              continue; // Don't break on transient errors, just retry
            }

            const statusData = await statusRes.json();
            console.log(`[poll ${pollCount}] job status:`, statusData.status);

            if (statusData.status === 'completed') {
              setPreview(statusData.result);
              setPipelineProgress(null);
              alert(t('create.courseCreatedSuccess'));
              isComplete = true;
            } else if (statusData.status === 'failed') {
              throw new Error(statusData.error || 'Job failed on the server.');
            }
            // If pending/processing, just continue the loop
          } catch (pollError) {
            console.warn(`[poll ${pollCount}] fetch error:`, pollError);
            // Continue polling - don't break on network glitches
          }
        }

        if (!isComplete) {
          throw new Error('Job timed out after 10 minutes. Check server logs.');
        }
      } else if (data.success) {
        // Fallback for synchronous responses (if any)
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

    // First AI response
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
      // Call AI topic analysis endpoint
      const response = await fetch('/api/backend/analyze-topics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentQuery: userInput,
          language: contentLanguage,
        }),
      })

      const data = await response.json()

      if (data.success) {
        // Convert API response to IdentifiedTopic format with bilingual support
        const analyzedTopics: IdentifiedTopic[] = data.topics.map((topic: any, index: number) => ({
          id: topic.id || `topic_${index + 1}`,
          name: topic.name_en || topic.name, // Default to English name
          name_zh: topic.name_zh || topic.name,
          name_en: topic.name_en || topic.name,
          description: topic.description_en || topic.description, // Default to English description
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

        // Add analysis complete message
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
        // Fallback if analysis fails
        const errorMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: t('create.analysisFailed'),
          timestamp: new Date()
        }

        setChatMessages(prev => [...prev, errorMessage])

        // Use fallback topics (bilingual)
        const fallbackTopics: IdentifiedTopic[] = [
          {
            id: '1',
            name: 'Please Specify Learning Topic',
            name_zh: '请具体说明学习主题',
            name_en: 'Please Specify Learning Topic',
            description: 'Please tell me the specific subject or topic you want to learn',
            description_zh: '请告诉我你想学习的具体科目或主题',
            description_en: 'Please tell me the specific subject or topic you want to learn',
            confidence: 0.5,
            icon: '',
            category: 'clarification',
            follow_up_questions: [
              'What subject do you want to learn? (e.g., math, physics, programming)',
              'Do you have specific learning goals? (e.g., exam preparation, project application)',
              'Which learning stage are you interested in? (e.g., beginner, intermediate, professional)'
            ],
            follow_up_questions_zh: [
              '你想学习什么科目？（如数学、物理、编程等）',
              '有特定的学习目标吗？（如考试准备、项目应用）',
              '对哪个学习阶段感兴趣？（如入门、进阶、专业）'
            ],
            follow_up_questions_en: [
              'What subject do you want to learn? (e.g., math, physics, programming)',
              'Do you have specific learning goals? (e.g., exam preparation, project application)',
              'Which learning stage are you interested in? (e.g., beginner, intermediate, professional)'
            ]
          }
        ]

        setIdentifiedTopics(fallbackTopics)
        setWorkflowPhase('topic-selection')
      }
    } catch (error) {
      console.error('Topic analysis failed:', error)

      const errorMessage: ChatMessage = {
        id: (Date.now() + 2).toString(),
        role: 'assistant',
        content: uiLanguage === 'zh'
          ? '抱歉，分析服务暂时不可用。让我为你推荐一些通用学习主题。'
          : 'Sorry, the analysis service is temporarily unavailable. Let me recommend some general learning topics for you.',
        timestamp: new Date()
      }

      setChatMessages(prev => [...prev, errorMessage])

      // Fallback topics with follow-up questions (bilingual)
      const fallbackTopics: IdentifiedTopic[] = [
        {
          id: '1',
          name: 'Please Specify Learning Topic',
          name_zh: '请具体说明学习主题',
          name_en: 'Please Specify Learning Topic',
          description: 'Please tell me the subject and specific topic you want to learn',
          description_zh: '请告诉我你想学习的科目和具体主题',
          description_en: 'Please tell me the subject and specific topic you want to learn',
          confidence: 0.5,
          icon: '',
          category: 'clarification',
          follow_up_questions: [
            'What subject do you want to learn? (e.g., literature, history, science, math, art, etc.)',
            'Do you have specific learning goals or areas of interest?',
            'Are you more interested in theory, practice, or a combination of both?',
            'Do you need basic introduction, specialized research, or exam preparation?'
          ],
          follow_up_questions_zh: [
            '你想学习什么科目？（如文学、历史、科学、数学、艺术等）',
            '有特定的学习目标或兴趣领域吗？',
            '对理论、实践还是两者结合更感兴趣？',
            '需要基础入门、专题研究还是考试准备？'
          ],
          follow_up_questions_en: [
            'What subject do you want to learn? (e.g., literature, history, science, math, art, etc.)',
            'Do you have specific learning goals or areas of interest?',
            'Are you more interested in theory, practice, or a combination of both?',
            'Do you need basic introduction, specialized research, or exam preparation?'
          ]
        },
        {
          id: '2',
          name: 'Literature Learning Topics',
          name_zh: '文学学习主题',
          name_en: 'Literature Learning Topics',
          description: 'Please specify the literature-related topics you want to learn',
          description_zh: '请具体说明你想学习的文学相关主题',
          description_en: 'Please specify the literature-related topics you want to learn',
          confidence: 0.6,
          icon: '',
          category: 'literature',
          follow_up_questions: [
            'What specific area of literature do you want to learn?',
            'Are you more interested in literary theory research or practical application?',
            'Do you need a basic introduction to literature or specialized research?',
            'Are there specific literary works, periods, or genres you want to learn?'
          ],
          follow_up_questions_zh: [
            '你想学习文学的哪个具体领域？',
            '对文学的理论研究还是实践应用更感兴趣？',
            '需要文学的基础入门还是专题研究？',
            '有特定的文学作品、时期或流派想学习吗？'
          ],
          follow_up_questions_en: [
            'What specific area of literature do you want to learn?',
            'Are you more interested in literary theory research or practical application?',
            'Do you need a basic introduction to literature or specialized research?',
            'Are there specific literary works, periods, or genres you want to learn?'
          ]
        },
        {
          id: '3',
          name: 'Science Learning Topics',
          name_zh: '科学学习主题',
          name_en: 'Science Learning Topics',
          description: 'Please specify the science-related topics you want to learn',
          description_zh: '请具体说明你想学习的科学相关主题',
          description_en: 'Please specify the science-related topics you want to learn',
          confidence: 0.6,
          icon: '',
          category: 'science',
          follow_up_questions: [
            'What specific area of science do you want to learn?',
            'Are you more interested in theoretical research or experimental application?',
            'Do you need a basic introduction to science or specialized research?',
            'Are there specific scientific concepts, theories, or experiments you want to learn?'
          ],
          follow_up_questions_zh: [
            '你想学习科学的哪个具体领域？',
            '对科学的理论研究还是实验应用更感兴趣？',
            '需要科学的基础入门还是专题研究？',
            '有特定的科学概念、理论或实验想学习吗？'
          ],
          follow_up_questions_en: [
            'What specific area of science do you want to learn?',
            'Are you more interested in theoretical research or experimental application?',
            'Do you need a basic introduction to science or specialized research?',
            'Are there specific scientific concepts, theories, or experiments you want to learn?'
          ]
        },
        {
          id: '4',
          name: 'Mathematics Learning Topics',
          name_zh: '数学学习主题',
          name_en: 'Mathematics Learning Topics',
          description: 'Please specify the mathematics-related topics you want to learn',
          description_zh: '请具体说明你想学习的数学相关主题',
          description_en: 'Please specify the mathematics-related topics you want to learn',
          confidence: 0.6,
          icon: '',
          category: 'mathematics',
          follow_up_questions: [
            'What specific area of mathematics do you want to learn?',
            'Are you more interested in theoretical research or practical application?',
            'Do you need a basic introduction to mathematics or specialized research?',
            'Are there specific mathematical concepts, formulas, or problems you want to learn?'
          ],
          follow_up_questions_zh: [
            '你想学习数学的哪个具体领域？',
            '对数学的理论研究还是实际应用更感兴趣？',
            '需要数学的基础入门还是专题研究？',
            '有特定的数学概念、公式或问题想学习吗？'
          ],
          follow_up_questions_en: [
            'What specific area of mathematics do you want to learn?',
            'Are you more interested in theoretical research or practical application?',
            'Do you need a basic introduction to mathematics or specialized research?',
            'Are there specific mathematical concepts, formulas, or problems you want to learn?'
          ]
        },
        {
          id: '5',
          name: 'Art Learning Topics',
          name_zh: '艺术学习主题',
          name_en: 'Art Learning Topics',
          description: 'Please specify the art-related topics you want to learn',
          description_zh: '请具体说明你想学习的艺术相关主题',
          description_en: 'Please specify the art-related topics you want to learn',
          confidence: 0.6,
          icon: '',
          category: 'art',
          follow_up_questions: [
            'What specific area of art do you want to learn?',
            'Are you more interested in art theory research or practical creation?',
            'Do you need a basic introduction to art or specialized research?',
            'Are there specific art forms, styles, or works you want to learn?'
          ],
          follow_up_questions_zh: [
            '你想学习艺术的哪个具体领域？',
            '对艺术的理论研究还是实践创作更感兴趣？',
            '需要艺术的基础入门还是专题研究？',
            '有特定的艺术形式、风格或作品想学习吗？'
          ],
          follow_up_questions_en: [
            'What specific area of art do you want to learn?',
            'Are you more interested in art theory research or practical creation?',
            'Do you need a basic introduction to art or specialized research?',
            'Are there specific art forms, styles, or works you want to learn?'
          ]
        }
      ]

      setIdentifiedTopics(fallbackTopics)
      setWorkflowPhase('topic-selection')
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

    // Add additional requirements from form if any
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
        <div className="space-y-6">
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
                  {/* Audio upload button */}
                  <label
                    title={uiLanguage === 'zh' ? '上传音频（FunASR转录）' : 'Upload audio (FunASR transcription)'}
                    className={`p-3 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors flex items-center justify-center ${isUploadingAudio ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                  >
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      disabled={isUploadingAudio}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAudioUpload(f); e.target.value = '' }}
                    />
                    {isUploadingAudio ? (
                      <svg className="animate-spin w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                  </label>

                  {/* Image/OCR upload button */}
                  <label
                    title={uiLanguage === 'zh' ? '上传图片/文档（PaddleOCR识别）' : 'Upload image/doc (PaddleOCR)'}
                    className={`p-3 rounded-lg border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors flex items-center justify-center ${isUploadingImage ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                  >
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      disabled={isUploadingImage}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = '' }}
                    />
                    {isUploadingImage ? (
                      <svg className="animate-spin w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
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
                  {uiLanguage === 'zh'
                    ? '请选择一个最感兴趣的学习主题：'
                    : 'Please select the topic you are most interested in:'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
                  {identifiedTopics.map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => {
                        setSelectedTopics([topic.id]);
                        // Auto-advance to next step or show detail input
                      }}
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
                          placeholder={uiLanguage === 'zh'
                            ? '例如：希望能专注于视觉化演示，多举几个生活中的例子...'
                            : 'E.g., Focus on visual demonstrations, include more real-life examples...'}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent h-[50px] min-h-[50px]"
                          rows={1}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={handleConfirmTopics} // This now triggers generation directly
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

                  {/* Progress Steps Visualization */}
                  <div className="flex justify-center gap-2 mt-8">
                    {[1, 2, 3, 4, 5].map((step) => {
                      const isActive = (pipelineProgress?.currentStep || 0) >= step;
                      return (
                        <div key={step} className={`w-3 h-3 rounded-full transition-colors duration-500 ${isActive ? 'bg-blue-500' : 'bg-gray-200'}`} />
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-400">
                    {uiLanguage === 'zh' ? '这通常需要 1-2 分钟，请耐心等待' : 'This usually takes 1-2 minutes, please wait'}
                  </p>
                </div>
              ) : preview ? (
                // Preview Content
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

                  {/* Video Player Section */}
                  {preview.video_url ? (
                    <div className="rounded-xl overflow-hidden shadow-lg bg-black aspect-video relative group">
                      <video
                        controls
                        className="w-full h-full"
                        src={preview.video_url.startsWith('http') ? preview.video_url : `/api/backend/media${preview.video_url}`}
                      >
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  ) : (
                    <div className="aspect-video bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-gray-300">
                      <div className="text-center text-gray-500">
                        <p className="mb-2">🎥 {uiLanguage === 'zh' ? '视频生成未包含或失败' : 'Video not included or generation failed'}</p>
                        <p className="text-xs">{t('create.includeVideoDescription')}</p>
                      </div>
                    </div>
                  )}

                  {/* Lesson Details */}
                  {preview.lesson_plan && (
                    <div className="prose max-w-none bg-gray-50 rounded-xl p-6">
                      <h3 className="text-xl font-bold text-gray-900 border-b pb-2">
                        {preview.lesson_plan.title}
                      </h3>
                      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-semibold">{uiLanguage === 'zh' ? '学习目标:' : 'Objective:'}</span>
                          <p className="mt-1 text-gray-600">{preview.lesson_plan.objective}</p>
                        </div>
                        <div>
                          <span className="font-semibold">{uiLanguage === 'zh' ? '时长:' : 'Duration:'}</span>
                          <p className="mt-1 text-gray-600">{preview.lesson_plan.total_duration_minutes} {t('common.minutes', { count: preview.lesson_plan.total_duration_minutes })}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-6 border-t">
                    <button
                      onClick={handleSave}
                      className="px-8 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-lg"
                    >
                      {t('create.saveCourseButton')}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}