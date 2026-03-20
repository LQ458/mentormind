'use client'

import Link from 'next/link'
import { useLanguage } from '../components/LanguageContext'

const principles = {
  en: [
    {
      title: 'Spacing Over Cramming',
      body: 'MentorMind schedules short review moments near the point where memory is likely to fade. The goal is to revisit just in time, not all at once.',
    },
    {
      title: 'Retrieval Before Rewatching',
      body: 'Instead of immediately replaying a lesson, the app first asks you to recall, explain, compare, or defend an idea. That effort strengthens long-term memory.',
    },
    {
      title: 'Productive Friction',
      body: 'When you are moving too smoothly, MentorMind can add a deliberate error, a debate, or a simulation so you shift from passive agreement to active reasoning.',
    },
    {
      title: 'Ownership Through Co-Creation',
      body: 'You can shape the lesson before rendering by adding context, choosing modes like seminar or simulation, and attaching your own examples or goals.',
    },
    {
      title: 'Teach-to-Learn and Desirable Difficulties',
      body: 'Some of the strongest learning effects appear when you have to explain, defend, or repair an idea under light pressure. MentorMind uses debates, oral defenses, and deliberate errors to create that kind of useful difficulty.',
    },
  ],
  zh: [
    {
      title: '间隔复习，而不是临时抱佛脚',
      body: 'MentorMind 会在记忆即将衰退的时候安排短时复习，用“刚刚好”的时机帮助你把内容记得更久。',
    },
    {
      title: '先检索，再回看',
      body: '系统会优先让你自己回忆、解释、比较或辩护，而不是立刻重放视频。这样的主动检索更能巩固长期记忆。',
    },
    {
      title: '适度摩擦，促进推理',
      body: '如果你学得太顺，MentorMind 会加入一个刻意错误、一场争论或一个模拟任务，把你从被动接受切换到主动判断。',
    },
    {
      title: '共同创作，增强拥有感',
      body: '你可以在生成前加入自己的背景、案例、目标和模式偏好，让课程真正围绕你的学习过程来构建。',
    },
    {
      title: '以教促学与“有益难度”',
      body: '很多深层学习，恰恰发生在你必须解释、辩护或修正一个观点的时候。MentorMind 会用研讨、口头答辩和刻意错误来制造这种“刚刚好的难度”。',
    },
  ],
}

export default function PrinciplesPage() {
  const { language } = useLanguage()
  const copy = language === 'zh' ? principles.zh : principles.en

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-8">
      <div className="rounded-3xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
        <div className="max-w-2xl">
          <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            {language === 'zh' ? 'MentorMind 设计原则' : 'MentorMind Design Principles'}
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">
            {language === 'zh'
              ? '这不是一个只会“生成内容”的工具。'
              : 'This is not just a content generator.'}
          </h1>
          <p className="mt-4 text-lg leading-8 text-slate-600">
            {language === 'zh'
              ? 'MentorMind 的目标，是把学生从被动观看者，变成主动管理自己学习过程的人。我们的核心机制来自间隔重复、检索练习、生成效应、以教促学，以及适度认知摩擦。'
              : 'MentorMind is designed to move learners from passive watching to active management of their own learning process. The product draws from spaced repetition, retrieval practice, the generation effect, teach-to-learn, and productive cognitive friction.'}
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {copy.map((item) => (
          <div key={item.title} className="rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">{item.title}</h2>
            <p className="mt-2 text-slate-600 leading-7">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-6 py-6">
        <h2 className="text-xl font-semibold text-blue-950">
          {language === 'zh' ? '它会怎样出现在产品里？' : 'How this appears in the product'}
        </h2>
        <ul className="mt-3 space-y-2 text-blue-900">
          <li>{language === 'zh' ? '仪表盘会在最该复习的时候推送 3 分钟挑战。' : 'The dashboard surfaces 3-minute challenges when forgetting risk is highest.'}</li>
          <li>{language === 'zh' ? '创建流程里可以开启研讨、模拟、答辩和刻意错误。' : 'The create flow lets you enable seminar, simulation, oral-defense, and deliberate-error modes.'}</li>
          <li>{language === 'zh' ? '课程页不只是播放视频，还会让你主持讨论、练习解释、做决策并接受专家追问。' : 'The lesson room does more than play video. It asks you to moderate, explain, decide, and defend under questioning.'}</li>
        </ul>
        <div className="mt-5">
          <Link href="/dashboard" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
            {language === 'zh' ? '返回仪表盘' : 'Back to Dashboard'}
          </Link>
        </div>
      </div>
    </div>
  )
}
