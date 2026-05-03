'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Bell, X, Check } from 'lucide-react'
import { useNotifications, type AppNotification } from '../lib/notifications'
import { useLanguage } from './LanguageContext'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { toastConfirm } from '../lib/toastConfirm'

function timeAgo(ms: number, lang: 'zh' | 'en'): string {
  const diff = Date.now() - ms
  const sec = Math.floor(diff / 1000)
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  if (lang === 'zh') {
    if (sec < 60) return '刚刚'
    if (min < 60) return `${min} 分钟前`
    if (hr < 24) return `${hr} 小时前`
    return `${day} 天前`
  }
  if (sec < 60) return 'just now'
  if (min < 60) return `${min}m ago`
  if (hr < 24) return `${hr}h ago`
  return `${day}d ago`
}

const KIND_TINT: Record<AppNotification['kind'], string> = {
  whats_new: 'border-l-indigo-400',
  system: 'border-l-slate-400',
  lesson: 'border-l-emerald-400',
  reminder: 'border-l-amber-400',
  tip: 'border-l-sky-400',
}

export default function NotificationsPanel() {
  const [open, setOpen] = useState(false)
  const { items, unreadCount, markRead, markAllRead, dismiss, clearAll } = useNotifications()
  const { language } = useLanguage()
  const lang: 'zh' | 'en' = language === 'zh' ? 'zh' : 'en'
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const trapRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: () => setOpen(false) })

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="icon-btn relative"
        aria-label={lang === 'zh' ? `通知 (${unreadCount} 条未读)` : `Notifications (${unreadCount} unread)`}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold leading-[16px] text-center"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={trapRef}
          tabIndex={-1}
          role="dialog"
          aria-label={lang === 'zh' ? '通知' : 'Notifications'}
          className="absolute right-0 top-full mt-2 w-[360px] max-w-[95vw] z-50 rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden focus:outline-none"
        >
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <div className="font-semibold text-slate-900 text-sm">
                {lang === 'zh' ? '通知' : 'Notifications'}
              </div>
              {unreadCount > 0 && (
                <div className="text-xs text-slate-500">
                  {lang === 'zh' ? `${unreadCount} 条未读` : `${unreadCount} unread`}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50"
                >
                  {lang === 'zh' ? '全部已读' : 'Mark all read'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-200"
                aria-label={lang === 'zh' ? '关闭' : 'Close'}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="text-3xl mb-2" aria-hidden>📭</div>
                <div className="text-sm text-slate-500">
                  {lang === 'zh' ? '暂无通知' : "You're all caught up"}
                </div>
              </div>
            ) : (
              <ul>
                {items.map((n) => (
                  <li
                    key={n.id}
                    className={`relative border-b border-slate-100 last:border-b-0 ${
                      !n.read ? 'bg-indigo-50/40' : 'bg-white'
                    }`}
                  >
                    <div className={`border-l-2 ${KIND_TINT[n.kind]} px-4 py-3`}>
                      <div className="flex items-start gap-2">
                        {n.icon && <span className="text-base shrink-0" aria-hidden>{n.icon}</span>}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-slate-900 truncate">
                              {n.title}
                            </h4>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {timeAgo(n.createdAt, lang)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.body}</p>
                          <div className="mt-2 flex items-center gap-2">
                            {!n.read && (
                              <button
                                type="button"
                                onClick={() => markRead(n.id)}
                                className="text-[11px] text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-0.5"
                              >
                                <Check size={11} /> {lang === 'zh' ? '标为已读' : 'Mark read'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => dismiss(n.id)}
                              className="text-[11px] text-slate-500 hover:text-rose-600"
                            >
                              {lang === 'zh' ? '删除' : 'Dismiss'}
                            </button>
                            {n.href && (
                              <a
                                href={n.href}
                                onClick={() => markRead(n.id)}
                                className="text-[11px] text-indigo-600 hover:text-indigo-800 ml-auto"
                              >
                                {lang === 'zh' ? '查看 →' : 'Open →'}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {items.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  toastConfirm(
                    lang === 'zh' ? '清空所有通知？' : 'Clear all notifications?',
                    {
                      destructive: true,
                      confirmLabel: lang === 'zh' ? '清空' : 'Clear',
                      cancelLabel: lang === 'zh' ? '取消' : 'Cancel',
                      onConfirm: () => clearAll(),
                    },
                  )
                }}
                className="text-[11px] text-slate-500 hover:text-rose-600"
              >
                {lang === 'zh' ? '清空全部' : 'Clear all'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
