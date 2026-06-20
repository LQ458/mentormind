export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'


export async function GET() {
  try {
    // Call real backend status endpoint
    const backendResponse = await fetch(`${BACKEND_URL}/status`, { cache: 'no-store' })

    if (!backendResponse.ok) {
      throw new Error(`Backend status error: ${backendResponse.status}`)
    }

    const statusData = await backendResponse.json()
    return NextResponse.json(statusData)
  } catch (error) {
    console.error('Failed to get backend status:', error)
    return NextResponse.json(
      {
        status: 'offline',
        error: 'Backend status service unreachable',
        services: {
          deepseek: 'unknown',
          funasr: { status: 'unknown', latency_ms: null },
          whisper: { status: 'unknown', latency_ms: null },
          paddle_ocr: { status: 'unknown', latency_ms: null },
          tts: 'unknown',
          ai_lessons: 'unknown',
        },
        language_support: {
          supported_languages: [
            { code: 'en', name: 'English', native_name: 'English' },
            { code: 'zh', name: 'Chinese', native_name: '中文' },
          ],
          default_language: 'zh',
          bilingual_support: true,
        },
      },
      { status: 503 },
    )
  }
}
