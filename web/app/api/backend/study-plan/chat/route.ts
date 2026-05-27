import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
const CHAT_TIMEOUT_MS = Number(process.env.STUDY_PLAN_CHAT_TIMEOUT_MS || 55000)

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function readUpstreamJson(res: Response) {
  const contentType = res.headers.get('content-type') || ''
  const text = await res.text()
  if (contentType.includes('application/json')) {
    try {
      return text ? JSON.parse(text) : {}
    } catch {
      return { success: false, error: 'Invalid JSON from study-plan service' }
    }
  }
  return {
    success: false,
    error: res.status === 504 ? 'Study-plan service timed out' : 'Study-plan service returned a non-JSON response',
    upstream_status: res.status,
    upstream_preview: text.slice(0, 240),
  }
}

export async function POST(req: NextRequest) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS)
  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND_URL}/study-plan/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers.get('Authorization') || '',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await readUpstreamJson(res)
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[study-plan/chat proxy] error:', err)
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return NextResponse.json(
      {
        success: false,
        error: timedOut
          ? 'Study-plan chat took too long. Please try a shorter answer or retry.'
          : 'Failed to reach study-plan service',
      },
      { status: timedOut ? 504 : 502 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
