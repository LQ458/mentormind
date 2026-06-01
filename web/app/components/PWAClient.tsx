'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, WifiOff, X } from 'lucide-react'
import { useLanguage } from './LanguageContext'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const INSTALL_DISMISSED_KEY = 'mm-pwa-install-dismissed-v1'

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname)
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari exposes standalone on navigator.
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

export default function PWAClient() {
  const { language } = useLanguage()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstall, setShowInstall] = useState(false)
  const [online, setOnline] = useState(true)
  const zh = language === 'zh'

  useEffect(() => {
    if (typeof window === 'undefined') return
    setOnline(window.navigator.onLine)

    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
      if (isLocalhost()) {
        navigator.serviceWorker.getRegistrations()
          .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
          .then(() => ('caches' in window ? window.caches.keys() : []))
          .then((keys) => Promise.all(keys.filter((key) => key.startsWith('mentormind-pwa-')).map((key) => window.caches.delete(key))))
          .catch((err) => {
            console.warn('[pwa] local service worker cleanup failed', err)
          })
      } else {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[pwa] service worker registration failed', err)
      })
      }
    }

    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (event: Event) => {
      event.preventDefault()
      const promptEvent = event as BeforeInstallPromptEvent
      setDeferredPrompt(promptEvent)
      const dismissedAt = Number(window.localStorage.getItem(INSTALL_DISMISSED_KEY) || 0)
      const dismissedRecently = Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000
      if (!isStandaloneDisplay() && !dismissedRecently) {
        window.setTimeout(() => setShowInstall(true), 1800)
      }
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const installText = useMemo(() => ({
    title: zh ? '添加到桌面，方便下次打开' : 'Add shortcut for next time',
    install: zh ? '添加' : 'Add',
    later: zh ? '稍后' : 'Later',
    offline: zh ? '已离线。联网后可继续生成和保存。' : 'You are offline. Connect to continue generating and saving.',
  }), [zh])

  const dismissInstall = () => {
    setShowInstall(false)
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()))
    } catch {
      // ignore
    }
  }

  const install = async () => {
    if (!deferredPrompt) {
      dismissInstall()
      return
    }
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice.catch(() => null)
    setDeferredPrompt(null)
    setShowInstall(false)
  }

  return (
    <>
      {!online && (
        <div className="fixed left-3 right-3 top-3 z-[80] mx-auto flex max-w-xl items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 shadow-lg">
          <WifiOff size={16} />
          <span className="flex-1">{installText.offline}</span>
        </div>
      )}

      {showInstall && deferredPrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-[var(--ink)] shadow-lg">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)]">
            <Download size={18} />
          </div>
          <div className="min-w-0 flex-1 text-sm font-medium">{installText.title}</div>
          <button type="button" className="btn btn-primary btn-sm" onClick={install}>
            {installText.install}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={installText.later}
            onClick={dismissInstall}
            style={{ width: 32, height: 32 }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </>
  )
}
