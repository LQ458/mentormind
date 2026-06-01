'use client'

import { useState, useCallback, useRef } from 'react'

export interface MediaContext {
  id: string
  type: 'audio' | 'image' | 'file'
  title: string
  summary: string
  text: string
  timestamp: Date
}

interface IngestUploadOptions {
  getToken?: () => Promise<string | null>
  syncImageOcr?: boolean
  onAuthInvalid?: () => void | Promise<void>
}

type UploadErrorType =
  | 'auth'
  | 'unsupported'
  | 'empty_file'
  | 'no_text'
  | 'timeout'
  | 'ocr_unavailable'
  | 'transcription_unavailable'
  | 'network'
  | 'backend'

interface UploadFailure {
  type: UploadErrorType
  detail: string
}

function extractErrorDetail(data: any): string {
  const raw = data?.detail || data?.details || data?.error || data?.message || ''
  if (typeof raw !== 'string') return String(raw || '')
  try {
    const parsed = JSON.parse(raw)
    return extractErrorDetail(parsed) || raw
  } catch {
    return raw
  }
}

function classifyUploadFailure(status: number | null, data: any, fallback: string): UploadFailure {
  const detail = extractErrorDetail(data) || fallback
  const lower = detail.toLowerCase()

  if (status === 401 || status === 403 || lower.includes('authentication') || lower.includes('unauthorized')) {
    return { type: 'auth', detail }
  }
  if (status === 400 || lower.includes('unsupported format') || lower.includes('unsupported file')) {
    return { type: 'unsupported', detail }
  }
  if (status === 504 || lower.includes('timed out') || lower.includes('timeout')) {
    return { type: 'timeout', detail }
  }
  if (
    status === 422 ||
    lower.includes('could not extract text') ||
    lower.includes('no speech detected') ||
    lower.includes('no text') ||
    lower.includes('empty')
  ) {
    return { type: 'no_text', detail }
  }
  if (lower.includes('paddleocr') || lower.includes('tesseract') || lower.includes('ocr')) {
    return { type: 'ocr_unavailable', detail }
  }
  if (lower.includes('transcription') || lower.includes('whisper') || lower.includes('funasr') || lower.includes('asr')) {
    return { type: 'transcription_unavailable', detail }
  }
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('failed to proxy')) {
    return { type: 'network', detail }
  }
  return { type: 'backend', detail }
}

function localizedUploadFailure(lang: 'zh' | 'en', failure: UploadFailure | null): string {
  if (!failure) {
    return lang === 'zh'
      ? '上传失败：暂时无法读取这个文件。'
      : 'Upload failed: this file could not be read yet.'
  }
  const suffix = failure.detail ? (lang === 'zh' ? ` 原因：${failure.detail}` : ` Reason: ${failure.detail}`) : ''
  const messages: Record<UploadErrorType, { zh: string; en: string }> = {
    auth: {
      zh: '上传失败：登录已过期或缺少权限，请重新登录后再试。',
      en: 'Upload failed: your sign-in expired or permission is missing. Please sign in again.',
    },
    unsupported: {
      zh: '上传失败：文件格式不支持。请上传图片、PDF、音频，或 txt/md/csv/json 文本文件。',
      en: 'Upload failed: unsupported file type. Upload an image, PDF, audio, or txt/md/csv/json text file.',
    },
    empty_file: {
      zh: '上传失败：文件是空的，或没有可读取的内容。',
      en: 'Upload failed: the file is empty or has no readable content.',
    },
    no_text: {
      zh: '上传失败：没有从文件中识别出可用文字。请换一张更清晰的图片，或直接粘贴题目文字。',
      en: 'Upload failed: no usable text was recognized. Try a clearer image or paste the problem text directly.',
    },
    timeout: {
      zh: '上传失败：识别超时。请裁剪成更小的文件后重试。',
      en: 'Upload failed: recognition timed out. Crop or shrink the file and try again.',
    },
    ocr_unavailable: {
      zh: '上传失败：图片/PDF 识别服务不可用。',
      en: 'Upload failed: image/PDF OCR is unavailable.',
    },
    transcription_unavailable: {
      zh: '上传失败：音频转写服务不可用。',
      en: 'Upload failed: audio transcription is unavailable.',
    },
    network: {
      zh: '上传失败：网络或代理连接异常。',
      en: 'Upload failed: network or proxy connection error.',
    },
    backend: {
      zh: '上传失败：后端处理异常。',
      en: 'Upload failed: backend processing error.',
    },
  }
  return `${messages[failure.type][lang]}${suffix}`
}

async function readJsonSafely(response: Response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

async function pollIngestStatus(jobId: string, type: 'audio' | 'image', headers: Record<string, string>) {
  let attempts = 0
  while (attempts < 60) {
    try {
      const res = await fetch(`/api/backend/job-status/${jobId}`, { headers })
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

export function useIngestUpload(lang: 'zh' | 'en', options: IngestUploadOptions = {}) {
  const { getToken, onAuthInvalid, syncImageOcr } = options
  const [contexts, setContexts] = useState<MediaContext[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadFailure, setUploadFailureState] = useState<UploadFailure | null>(null)
  const uploadFailureRef = useRef<UploadFailure | null>(null)

  const setUploadFailure = useCallback((failure: UploadFailure | null) => {
    uploadFailureRef.current = failure
    setUploadFailureState(failure)
    if (failure?.type === 'auth') void onAuthInvalid?.()
  }, [onAuthInvalid])

  const getAuthHeaders = useCallback(async () => {
    const headers: Record<string, string> = {}
    const token = await getToken?.()
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }, [getToken])

  const getLastUploadErrorMessage = useCallback(() => {
    return localizedUploadFailure(lang, uploadFailureRef.current)
  }, [lang])

  const clearUploadError = useCallback(() => {
    setUploadFailure(null)
  }, [setUploadFailure])

  const handleAudioUpload = useCallback(
    async (file: File) => {
      setIsUploading(true)
      setUploadFailure(null)
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('language', 'auto')
        formData.append('display_language', lang)
        const authHeaders = await getAuthHeaders()
        const response = await fetch('/api/backend/ingest/audio', {
          method: 'POST',
          headers: authHeaders,
          body: formData,
        })
        let data = await readJsonSafely(response)
        if (!response.ok) {
          setUploadFailure(classifyUploadFailure(response.status, data, 'Audio upload failed'))
          return null
        }

        if (data.success && data.status === 'processing' && data.job_id) {
          try {
            data = await pollIngestStatus(data.job_id, 'audio', authHeaders)
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
          setUploadFailure(classifyUploadFailure(null, data, 'Audio upload failed'))
          return null
        }
      } catch (err) {
        console.error('Audio upload error:', err)
        setUploadFailure(classifyUploadFailure(null, err, err instanceof Error ? err.message : 'Audio upload error'))
        return null
      } finally {
        setIsUploading(false)
      }
    },
    [getAuthHeaders, setUploadFailure, lang],
  )

  const handleImageUpload = useCallback(
    async (file: File) => {
      setIsUploading(true)
      setUploadFailure(null)
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('language', 'auto')
        formData.append('display_language', lang)
        if (syncImageOcr) formData.append('sync', 'true')
        const authHeaders = await getAuthHeaders()
        const response = await fetch('/api/backend/ingest/image', {
          method: 'POST',
          headers: authHeaders,
          body: formData,
        })
        let data = await readJsonSafely(response)
        if (!response.ok) {
          setUploadFailure(classifyUploadFailure(response.status, data, 'Image upload failed'))
          return null
        }

        if (data.success && data.status === 'processing' && data.job_id) {
          try {
            data = await pollIngestStatus(data.job_id, 'image', authHeaders)
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
          setUploadFailure(classifyUploadFailure(null, data, 'Image upload failed'))
          return null
        }
      } catch (err) {
        console.error('Image upload error:', err)
        setUploadFailure(classifyUploadFailure(null, err, err instanceof Error ? err.message : 'Image upload error'))
        return null
      } finally {
        setIsUploading(false)
      }
    },
    [getAuthHeaders, lang, setUploadFailure, syncImageOcr],
  )

  const handleTextUpload = useCallback(
    async (file: File) => {
      setIsUploading(true)
      setUploadFailure(null)
      try {
        const text = await file.text()
        if (!text.trim()) {
          setUploadFailure({ type: 'empty_file', detail: 'Text file is empty' })
          return null
        }
        const clipped = text.trim().slice(0, 12000)
        const newContext: MediaContext = {
          id: Date.now().toString(),
          type: 'file',
          title: file.name,
          summary: clipped.substring(0, 100) + (clipped.length > 100 ? '...' : ''),
          text: clipped,
          timestamp: new Date(),
        }
        setContexts((prev) => [newContext, ...prev])
        return newContext
      } catch (err) {
        console.error('Text file upload error:', err)
        setUploadFailure(classifyUploadFailure(null, err, err instanceof Error ? err.message : 'Text file upload error'))
        return null
      } finally {
        setIsUploading(false)
      }
    },
    [setUploadFailure],
  )

  const removeContext = useCallback((id: string) => {
    setContexts((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const buildContextMessage = useCallback((): string | null => {
    if (contexts.length === 0) return null
    const parts = contexts.map((c) => {
      const label = c.type === 'audio'
        ? (lang === 'zh' ? '音频' : 'Audio')
        : c.type === 'image'
          ? (lang === 'zh' ? '图片' : 'Image')
          : (lang === 'zh' ? '文件' : 'File')
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
    uploadFailure,
    handleAudioUpload,
    handleImageUpload,
    handleTextUpload,
    getLastUploadErrorMessage,
    clearUploadError,
    removeContext,
    buildContextMessage,
    clearContexts,
  }
}
