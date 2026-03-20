'use client'

import Link from 'next/link'
import { useLanguage } from '../components/LanguageContext'

const features = {
  en: [
    {
      icon: '🎬',
      title: 'AI Video Lessons',
      desc: 'Generate a full animated lesson on any topic in minutes — with narration, visuals, and a structured lesson plan.',
    },
    {
      icon: '🧑‍🏫',
      title: 'Multi-Agent Seminar',
      desc: 'Three AI roles — a mentor, a top student, and a struggling peer — debate the concept. You moderate and reach your own synthesis.',
    },
    {
      icon: '🎯',
      title: 'Applied Simulation',
      desc: 'Put your knowledge into a real decision-making scenario. A demanding AI counterparty pushes back. Adapt and justify your choices.',
    },
    {
      icon: '🏛️',
      title: 'Oral Defense',
      desc: 'Face a three-expert panel and defend your understanding. Not about memorizing answers — about explaining why something works.',
    },
    {
      icon: '🧠',
      title: 'Memory Challenge',
      desc: 'A 3-minute retrieval sprint without replaying the lesson. Explain, give an example, name the misconception — no peeking.',
    },
    {
      icon: '🔍',
      title: 'Deliberate Error Audit',
      desc: 'A plausible but flawed claim is placed in front of you. Find the error, explain why it misleads, and state the correction.',
    },
    {
      icon: '🔁',
      title: 'Spaced Review Queue',
      desc: 'Forgetting-curve scheduling surfaces the right review at the right time — memory challenge, oral defense, or error audit.',
    },
    {
      icon: '🎙️',
      title: 'Audio & Image Ingestion',
      desc: 'Upload a lecture recording or a photo of your notes. MentorMind transcribes and builds a lesson around your real context.',
    },
    {
      icon: '👤',
      title: 'Learner Profile',
      desc: 'Set your grade level, subject interests, goals, and learning style. Every lesson and recommendation adapts to your profile.',
    },
  ],
  zh: [
    {
      icon: '🎬',
      title: 'AI 视频课程',
      desc: '针对任何主题，几分钟内生成带旁白、动画和教学计划的完整课程。',
    },
    {
      icon: '🧑‍🏫',
      title: '多智能体研讨',
      desc: '导师、高水平同伴和吃力的同伴三种角色争论同一概念，你担任主持人，做出综合判断。',
    },
    {
      icon: '🎯',
      title: '应用模拟',
      desc: '把知识放进真实决策场景，苛刻的 AI 对手会反驳你，你需要调整并解释自己的选择。',
    },
    {
      icon: '🏛️',
      title: '口头答辩',
      desc: '面对三位专家评委，捍卫你的理解。重点不是背答案，而是说清楚"为什么成立"。',
    },
    {
      icon: '🧠',
      title: '记忆挑战',
      desc: '3 分钟主动检索冲刺，不回看课程，靠自己解释、举例、说出常见误解。',
    },
    {
      icon: '🔍',
      title: '刻意错误审计',
      desc: '一个看似合理却有缺陷的说法摆在你面前，找出错误、解释为何会误导人、给出正确说法。',
    },
    {
      icon: '🔁',
      title: '间隔复习队列',
      desc: '基于遗忘曲线，在最容易遗忘的时刻推送记忆挑战、口头答辩或刻意错误审计。',
    },
    {
      icon: '🎙️',
      title: '音频与图像导入',
      desc: '上传课堂录音或笔记照片，MentorMind 会转录内容并围绕你的真实情境构建课程。',
    },
    {
      icon: '👤',
      title: '学习者画像',
      desc: '设置学段、兴趣、目标和学习风格，每节课和每条推荐都会根据你的画像个性化调整。',
    },
  ],
}

const principles = {
  en: [
    { title: 'Spacing Over Cramming', body: 'Reviews are scheduled near the point where memory fades — revisit just in time, not all at once.' },
    { title: 'Retrieval Before Rewatching', body: 'Recall, explain, compare, or defend before replaying. That active effort strengthens long-term memory.' },
    { title: 'Productive Friction', body: 'When learning feels too smooth, a deliberate error or debate shifts you from passive agreement to active reasoning.' },
    { title: 'Ownership Through Co-Creation', body: 'Shape the lesson before it renders: add context, choose seminar or simulation, attach your own goals.' },
    { title: 'Teach-to-Learn', body: 'Explaining and defending under light pressure creates some of the strongest learning effects known to cognitive science.' },
  ],
  zh: [
    { title: '间隔复习，而非临时抱佛脚', body: '在记忆即将衰退时安排复习，用"刚刚好"的时机帮你记得更久。' },
    { title: '先检索，再回看', body: '先回忆、解释、比较或辩护，再重放视频。主动检索更能巩固长期记忆。' },
    { title: '适度摩擦，促进推理', body: '学得太顺时，刻意错误或辩论会把你从被动接受切换到主动判断。' },
    { title: '共同创作，增强拥有感', body: '生成前加入背景、案例、目标和模式偏好，让课程真正围绕你来构建。' },
    { title: '以教促学', body: '在轻度压力下解释和捍卫一个观点，是认知科学中最强的学习效应之一。' },
  ],
}

export default function PrinciplesPage() {
  const { language } = useLanguage()
  const featureCopy = language === 'zh' ? features.zh : features.en
  const principlesCopy = language === 'zh' ? principles.zh : principles.en

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-16 px-4">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-10 py-14 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-2xl">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300 mb-4">MentorMind</div>
          <h1 className="text-4xl font-bold tracking-tight leading-tight">
            {language === 'zh'
              ? '不只是生成内容，而是重塑你的学习过程。'
              : 'Not just a content generator. A system that reshapes how you learn.'}
          </h1>
          <p className="mt-5 text-lg text-slate-300 leading-8">
            {language === 'zh'
              ? 'MentorMind 把间隔重复、检索练习、以教促学和认知摩擦融入每节课和每次复习中，让你从被动观看变成主动掌控。'
              : 'MentorMind weaves spaced repetition, retrieval practice, teach-to-learn, and productive friction into every lesson and review, turning passive watching into active ownership.'}
          </p>
          <div className="mt-8 flex gap-4 flex-wrap">
            <Link href="/create" className="rounded-lg bg-blue-500 hover:bg-blue-400 px-5 py-2.5 text-sm font-semibold text-white transition-colors">
              {language === 'zh' ? '创建课程 →' : 'Create a Lesson →'}
            </Link>
            <Link href="/dashboard" className="rounded-lg border border-white/20 hover:border-white/40 px-5 py-2.5 text-sm font-semibold text-white transition-colors">
              {language === 'zh' ? '仪表盘' : 'Dashboard'}
            </Link>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {language === 'zh' ? '核心功能' : 'What's Inside'}
        </h2>
        <p className="text-slate-500 text-sm mb-8">
          {language === 'zh' ? '每个功能都是完整的学习干预，而不是花哨的包装。' : 'Every feature is a real learning intervention, not a cosmetic add-on.'}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featureCopy.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 hover:shadow-md transition-shadow">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-base font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-6">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Flow */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8">
        <h2 className="text-xl font-bold text-slate-900 mb-6">
          {language === 'zh' ? '一节课的完整流程' : 'The Full Learning Loop'}
        </h2>
        <div className="grid sm:grid-cols-4 gap-4 text-center">
          {(language === 'zh'
            ? [
                { step: '1', label: '创建', sub: '输入主题，选择模式' },
                { step: '2', label: '学习', sub: '观看视频，主持研讨' },
                { step: '3', label: '练习', sub: '挑战、答辩、模拟' },
                { step: '4', label: '复习', sub: '遗忘曲线推送复习' },
              ]
            : [
                { step: '1', label: 'Create', sub: 'Enter topic, choose modes' },
                { step: '2', label: 'Learn', sub: 'Watch video, run seminar' },
                { step: '3', label: 'Practice', sub: 'Challenge, defense, simulate' },
                { step: '4', label: 'Review', sub: 'Spaced nudges surface at the right time' },
              ]
          ).map((item, i, arr) => (
            <div key={item.step} className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">{item.step}</div>
              <div className="font-semibold text-slate-900">{item.label}</div>
              <div className="text-xs text-slate-500">{item.sub}</div>
              {i < arr.length - 1 && (
                <div className="hidden sm:block absolute translate-x-full text-slate-300 text-lg mt-2">→</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Design Principles */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {language === 'zh' ? '设计原则' : 'Design Principles'}
        </h2>
        <p className="text-slate-500 text-sm mb-8">
          {language === 'zh' ? '这些原则来自认知科学，不是市场话术。' : 'Grounded in cognitive science, not marketing copy.'}
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {principlesCopy.map((p, i) => (
            <div key={p.title} className={`rounded-2xl border bg-white p-6 ${i === principlesCopy.length - 1 && principlesCopy.length % 2 !== 0 ? 'sm:col-span-2' : ''}`}>
              <div className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-2">0{i + 1}</div>
              <h3 className="text-base font-semibold text-slate-900">{p.title}</h3>
              <p className="mt-2 text-sm text-slate-500 leading-6">{p.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 px-10 py-12 text-white text-center shadow-lg">
        <h2 className="text-3xl font-bold">
          {language === 'zh' ? '准备好了吗？' : 'Ready to try it?'}
        </h2>
        <p className="mt-3 text-blue-100 text-base">
          {language === 'zh' ? '输入一个你想搞懂的主题，剩下的交给 MentorMind。' : 'Enter a topic you want to actually understand. MentorMind handles the rest.'}
        </p>
        <Link href="/create" className="mt-6 inline-block rounded-lg bg-white text-blue-700 font-semibold px-6 py-3 text-sm hover:bg-blue-50 transition-colors">
          {language === 'zh' ? '开始学习 →' : 'Start Learning →'}
        </Link>
      </div>

    </div>
  )
}
