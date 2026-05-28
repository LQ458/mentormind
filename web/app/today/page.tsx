'use client'

import Link from 'next/link'
import { ArrowRight, BookOpen, CalendarDays, Flame, Layers } from 'lucide-react'
import { useLanguage } from '../components/LanguageContext'

const actions = [
  {
    href: '/dashboard',
    icon: CalendarDays,
    en: 'Open today dashboard',
    zh: '打开今日面板',
  },
  {
    href: '/study-plan',
    icon: Layers,
    en: 'Continue study plan',
    zh: '继续学习计划',
  },
  {
    href: '/lessons',
    icon: BookOpen,
    en: 'Review saved lessons',
    zh: '复习已保存课程',
  },
]

export default function TodayPage() {
  const { language } = useLanguage()
  const zh = language === 'zh'

  return (
    <div className="mx-auto max-w-4xl">
      <section className="mb-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1 text-sm text-[var(--ink-muted)]">
          <Flame size={14} />
          {zh ? '今日' : 'Today'}
        </div>
        <h1 className="font-serif text-4xl font-normal leading-tight text-[var(--ink)]">
          {zh ? '今天先完成一件重要的事。' : 'Start with one useful step today.'}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--ink-muted)]">
          {zh
            ? '复习、继续计划、打开课程，都从这里开始。'
            : 'Review, continue your plan, or reopen a lesson from one place.'}
        </p>
      </section>

      <div className="grid gap-3">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.href}
              href={action.href}
              className="card-new hover flex items-center gap-4 p-4 text-[var(--ink)] no-underline"
            >
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)]">
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-medium">{zh ? action.zh : action.en}</div>
                <div className="text-sm text-[var(--ink-muted)]">
                  {zh ? '快速继续学习' : 'Continue quickly'}
                </div>
              </div>
              <ArrowRight size={18} />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
