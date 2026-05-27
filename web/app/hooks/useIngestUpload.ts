'use client'

import { useState, useCallback } from 'react'

export interface MediaContext {
  id: string
  type: 'audio' | 'image'
  title: string
  summary: string
  text: string
  timestamp: Date
}

async function pollIngestStatus(jobId: string, type: 'audio' | 'image') {
  let attempts = 0
  while (attempts < 60) {
    try {
      const res = await fetch(`/api/backend/job-status/${jobId}`)
      const statusData = await res.json()

      if (statusData.status === 'completed' && statusData.result) {
        return statusData.result
      } else if (statusData.status === 'failed') {
        throw new Error(statusData.error || 'Task failed')
      }
    } catch (err) {
      if ((err as Error).message?.includes('failed')) throw err
    }
    attempts++
    await new Promise((r) => setTimeout(r, 5000))
  }
  throw new Error('Polling timeout')
}

export function useIngestUpload(lang: 'zh' | 'en') {
  const [contexts, setContexts] = useState<MediaContext[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const handleAudioUpload = useCallback(
    async (file: File) => {
      setIsUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('language', 'auto')
        formData.append('display_language', lang)
        const response = await fetch('/api/backend/ingest/audio', {
          method: 'POST',
          body: formData,
        })
        let data = await response.json()

        if (data.success && data.status === 'processing' && data.job_id) {
          try {
            data = await pollIngestStatus(data.job_id, 'audio')
          } catch (pollErr) {
            console.error('Audio polling error:', pollErr)
            data = { success: false, error: 'Transcription timed out' }
          }
        }

        if (data.success && data.text) {
          const newContext: MediaContext = {
            id: Date.now().toString(),
            type: 'audio',
            title: file.name,
            summary: data.summary || data.text.substring(0, 100) + '...',
            text: data.text,
            timestamp: new Date(),
          }
          setContexts((prev) => [newContext, ...prev])
          return newContext
        } else {
          console.error('Audio upload failed:', data)
          return null
        }
      } catch (err) {
        console.error('Audio upload error:', err)
        return null
      } finally {
        setIsUploading(false)
      }
    },
    [lang],
  )

  const handleImageUpload = useCallback(
    async (file: File) => {
      setIsUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('language', 'auto')
        formData.append('display_language', lang)
        const response = await fetch('/api/backend/ingest/image', {
          method: 'POST',
          body: formData,
        })
        let data = await response.json()

        if (data.success && data.status === 'processing' && data.job_id) {
          try {
            data = await pollIngestStatus(data.job_id, 'image')
          } catch (pollErr) {
            console.error('Image polling error:', pollErr)
            data = { success: false, error: 'OCR timed out' }
          }
        }

        if (data.success && data.text) {
          const newContext: MediaContext = {
            id: Date.now().toString(),
            type: 'image',
            title: file.name,
            summary: data.summary || data.text.substring(0, 100) + '...',
            text: data.text,
            timestamp: new Date(),
          }
          setContexts((prev) => [newContext, ...prev])
          return newContext
        } else {
          console.error('Image upload failed:', data)
          return null
        }
      } catch (err) {
        console.error('Image upload error:', err)
        return null
      } finally {
        setIsUploading(false)
      }
    },
    [lang],
  )

  const removeContext = useCallback((id: string) => {
    setContexts((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const buildContextMessage = useCallback((): string | null => {
    if (contexts.length === 0) return null
    const parts = contexts.map((c) => {
      const label = c.type === 'audio' ? (lang === 'zh' ? '音频' : 'Audio') : (lang === 'zh' ? '图片' : 'Image')
      return `[${label}: ${c.title}]\n${c.text}`
    })
    return lang === 'zh'
      ? `以下是我上传的学习材料内容：\n\n${parts.join('\n\n')}`
      : `Here is content from my uploaded study materials:\n\n${parts.join('\n\n')}`
  }, [contexts, lang])

  const clearContexts = useCallback(() => {
    setContexts([])
  }, [])

  return {
    contexts,
    isUploading,
    handleAudioUpload,
    handleImageUpload,
    removeContext,
    buildContextMessage,
    clearContexts,
  }
}
