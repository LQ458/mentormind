'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'

const GAOKAO_SUBJECTS = [
  { id: 'math', label: '数学', icon: '📐' },
  { id: 'physics', label: '物理', icon: '⚛️' },
  { id: 'chemistry', label: '化学', icon: '🧪' },
  { id: 'biology', label: '生物', icon: '🧬' },
]

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  suggested_actions?: string[]
  needs_search?: boolean
  timestamp: Date
}

interface PracticeChoice {
  key: string
  text: string
}

interface PracticeProblem {
  id: string
  type: '选择题' | '解答题' | string
  question: string
  choices?: PracticeChoice[]
  answer?: string
  solution?: string
}

interface PracticeSession {
  problems: PracticeProblem[]
  userAnswers: Record<string, string>
  revealed: Record<string, boolean>
}

function MessageBubble({
  msg,
  onActionClick,
}: {
  msg: ChatMessage
  onActionClick: (action: string) => void
}) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <span className="text-xs text-gray-500">高考助手</span>
          </div>
        )}
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? 'bg-blue-600 text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
          }`}
        >
          {msg.content.split('\n').map((line, i) => (
            <p key={i} className={line.trim() === '' ? 'h-2' : ''}>
              {line}
            </p>
          ))}
        </div>
        {msg.needs_search && (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
            <span>📚</span>
            <span>可能需要搜索最新资源</span>
          </div>
        )}
        {msg.suggested_actions && msg.suggested_actions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {msg.suggested_actions.map((action, i) => (
              <button
                key={i}
                onClick={() => onActionClick(action)}
                className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-full px-3 py-1 transition-colors"
              >
                {action}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1 px-1">
          {msg.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

function PracticePanel({
  session,
  onAnswerChange,
  onReveal,
}: {
  session: PracticeSession
  onAnswerChange: (problemId: string, answer: string) => void
  onReveal: (problemId: string) => void
}) {
  return (
    <div className="space-y-6">
      {session.problems.map((problem, idx) => (
        <div key={problem.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
              第{idx + 1}题
            </span>
            <span className="text-xs text-gray-500">{problem.type}</span>
          </div>
          <p className="text-sm text-gray-800 mb-3 leading-relaxed">{problem.question}</p>

          {problem.type === '选择题' && problem.choices && (
            <div className="space-y-2 mb-3">
              {problem.choices.map((choice) => (
                <label
                  key={choice.key}
                  className="flex items-start gap-2 cursor-pointer group"
                >
                  <input
                    type="radio"
                    name={`problem-${problem.id}`}
                    value={choice.key}
                    checked={session.userAnswers[problem.id] === choice.key}
                    onChange={() => onAnswerChange(problem.id, choice.key)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-gray-900">
                    {choice.key}. {choice.text}
                  </span>
                </label>
              ))}
            </div>
          )}

          {problem.type === '解答题' && (
            <textarea
              className="w-full text-sm border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 mb-3"
              rows={4}
              placeholder="在此写下你的解答过程..."
              value={session.userAnswers[problem.id] || ''}
              onChange={(e) => onAnswerChange(problem.id, e.target.value)}
            />
          )}

          {!session.revealed[problem.id] ? (
            <button
              onClick={() => onReveal(problem.id)}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg px-3 py-1.5 transition-colors"
            >
              查看答案
            </button>
          ) : (
            <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-xs font-semibold text-green-700 mb-1">参考答案</p>
              <p className="text-sm text-green-800">{problem.answer}</p>
              {problem.solution && (
                <>
                  <p className="text-xs font-semibold text-green-700 mt-2 mb-1">解题思路</p>
                  <p className="text-sm text-green-800 leading-relaxed">{problem.solution}</p>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function GaokaoPage() {
  const { getToken, isLoaded: authLoaded, isSignedIn } = useAuth()

  const [selectedSubject, setSelectedSubject] = useState(GAOKAO_SUBJECTS[0].id)
  const [topicFocus, setTopicFocus] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null)
  const [isPracticeLoading, setIsPracticeLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'practice'>('chat')

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load session_id from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('gaokao_session_id')
    if (stored) setSessionId(stored)
  }, [])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      const subject = GAOKAO_SUBJECTS.find((s) => s.id === selectedSubject)
      setMessages([
        {
          id: '1',
          role: 'assistant',
          content: `你好！我是你的高考${subject?.label}助手 ${subject?.icon}\n\n有什么${subject?.label}问题想搞懂？或者告诉我你现在在复习哪个章节，我来帮你梳理重难点！`,
          suggested_actions: ['讲解函数与导数', '帮我出几道题', '我不知道从哪开始复习'],
          timestamp: new Date(),
        },
      ])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!authLoaded || !isSignedIn) return { 'Content-Type': 'application/json' }
    const token = await getToken()
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }, [authLoaded, isSignedIn, getToken])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isTyping) return

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      setUserInput('')
      setIsTyping(true)

      try {
        const headers = await getAuthHeaders()
        const res = await fetch('/api/backend/gaokao/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: trimmed,
            session_id: sessionId,
            subject: selectedSubject,
            topic_focus: topicFocus || undefined,
          }),
        })

        const data = await res.json()

        if (data.session_id) {
          setSessionId(data.session_id)
          localStorage.setItem('gaokao_session_id', data.session_id)
        }

        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.content || data.response || data.message || '抱歉，我没有理解你的问题，请再试试。',
          suggested_actions: data.suggested_actions || [],
          needs_search: data.needs_search || false,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMsg])
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: '网络错误，请检查连接后重试。',
            timestamp: new Date(),
          },
        ])
      } finally {
        setIsTyping(false)
      }
    },
    [isTyping, sessionId, selectedSubject, topicFocus, getAuthHeaders]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(userInput)
    }
  }

  const handleNewSession = () => {
    setSessionId(null)
    localStorage.removeItem('gaokao_session_id')
    setMessages([])
    setPracticeSession(null)
    setActiveTab('chat')
    // re-trigger greeting by clearing messages (useEffect will fire)
    const subject = GAOKAO_SUBJECTS.find((s) => s.id === selectedSubject)
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: `新会话已开始！我们来继续攻克${subject?.label} ${subject?.icon}\n\n有什么想学的内容？`,
        suggested_actions: ['从基础概念开始', '出几道练习题', '讲解解题技巧'],
        timestamp: new Date(),
      },
    ])
  }

  const handleSubjectChange = (subjectId: string) => {
    setSelectedSubject(subjectId)
    // Don't reset session — user may want to switch subjects mid-conversation
  }

  const handleStartPractice = async () => {
    setIsPracticeLoading(true)
    setActiveTab('practice')

    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/backend/gaokao/practice', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: sessionId,
          subject: selectedSubject,
          topic_focus: topicFocus || undefined,
        }),
      })

      const data = await res.json()
      const problems: PracticeProblem[] = data.problems || []

      setPracticeSession({
        problems,
        userAnswers: {},
        revealed: {},
      })
    } catch {
      setPracticeSession({
        problems: [
          {
            id: 'fallback-1',
            type: '选择题',
            question: '暂时无法获取练习题，请稍后重试。',
            choices: [],
            answer: '',
          },
        ],
        userAnswers: {},
        revealed: {},
      })
    } finally {
      setIsPracticeLoading(false)
    }
  }

  const handleAnswerChange = (problemId: string, answer: string) => {
    setPracticeSession((prev) =>
      prev ? { ...prev, userAnswers: { ...prev.userAnswers, [problemId]: answer } } : prev
    )
  }

  const handleReveal = (problemId: string) => {
    setPracticeSession((prev) =>
      prev ? { ...prev, revealed: { ...prev.revealed, [problemId]: true } } : prev
    )
  }

  const currentSubject = GAOKAO_SUBJECTS.find((s) => s.id === selectedSubject)

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">高</span>
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">高考智能辅导</h1>
                <p className="text-xs text-gray-500">AI 助手陪你备战高考</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleStartPractice}
                disabled={isPracticeLoading}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-50"
              >
                {isPracticeLoading ? '生成中...' : '出题练习'}
              </button>
              <button
                onClick={handleNewSession}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg px-3 py-1.5 transition-colors"
              >
                新会话
              </button>
            </div>
          </div>

          {/* Subject tabs */}
          <div className="flex gap-1">
            {GAOKAO_SUBJECTS.map((subject) => (
              <button
                key={subject.id}
                onClick={() => handleSubjectChange(subject.id)}
                className={`flex items-center gap-1 text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${
                  selectedSubject === subject.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span>{subject.icon}</span>
                <span>{subject.label}</span>
              </button>
            ))}
          </div>

          {/* Topic focus input */}
          <div className="mt-2">
            <input
              type="text"
              value={topicFocus}
              onChange={(e) => setTopicFocus(e.target.value)}
              placeholder={`当前学习主题（选填）：如"${currentSubject?.label === '数学' ? '导数应用' : currentSubject?.label === '物理' ? '电磁感应' : currentSubject?.label === '化学' ? '有机化学' : '遗传与进化'}"`}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            />
          </div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="bg-white border-b border-gray-100 px-4">
        <div className="max-w-3xl mx-auto flex gap-4">
          <button
            onClick={() => setActiveTab('chat')}
            className={`text-sm font-medium py-2 border-b-2 transition-colors ${
              activeTab === 'chat'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            对话学习
          </button>
          <button
            onClick={() => setActiveTab('practice')}
            className={`text-sm font-medium py-2 border-b-2 transition-colors ${
              activeTab === 'practice'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            练习题
            {practiceSession && (
              <span className="ml-1 text-xs bg-blue-100 text-blue-600 rounded-full px-1.5 py-0.5">
                {practiceSession.problems.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-4">
          {activeTab === 'chat' && (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} onActionClick={sendMessage} />
              ))}
              {isTyping && (
                <div className="flex justify-start mb-4">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex gap-1 items-center">
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </>
          )}

          {activeTab === 'practice' && (
            <>
              {isPracticeLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm">正在为你生成练习题...</p>
                </div>
              )}
              {!isPracticeLoading && !practiceSession && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <span className="text-4xl mb-3">📝</span>
                  <p className="text-sm">点击"出题练习"生成专属练习题</p>
                  <p className="text-xs mt-1">题目将根据你的学习内容智能生成</p>
                </div>
              )}
              {!isPracticeLoading && practiceSession && (
                <PracticePanel
                  session={practiceSession}
                  onAnswerChange={handleAnswerChange}
                  onReveal={handleReveal}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Input area — only shown on chat tab */}
      {activeTab === 'chat' && (
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`问我关于${currentSubject?.label}的任何问题...（Enter 发送，Shift+Enter 换行）`}
                rows={1}
                className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 max-h-32 overflow-y-auto"
                style={{ lineHeight: '1.5' }}
              />
              <button
                onClick={() => sendMessage(userInput)}
                disabled={!userInput.trim() || isTyping}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors flex-shrink-0"
              >
                发送
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5 text-center">
              AI 生成内容仅供参考，请以课本和老师讲解为准
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
