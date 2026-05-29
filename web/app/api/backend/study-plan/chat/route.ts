import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
const CHAT_TIMEOUT_MS = Number(process.env.STUDY_PLAN_CHAT_TIMEOUT_MS || 55000)

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeRequestId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

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
  const startedAt = Date.now()
  let requestId = makeRequestId()
  try {
    const body = await req.json()
    if (typeof body?.request_id === 'string' && body.request_id) {
      requestId = body.request_id
    } else if (body && typeof body === 'object') {
      body.request_id = requestId
    }
    console.info('[study-plan/chat proxy] start', {
      requestId,
      stage: body?.stage,
      subject: body?.subject,
      framework: body?.framework,
      historyLen: Array.isArray(body?.history) ? body.history.length : 0,
    })
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
    console.info('[study-plan/chat proxy] done', {
      requestId,
      status: res.status,
      source: data?.response_source ?? 'unknown',
      elapsedMs: Date.now() - startedAt,
    })
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[study-plan/chat proxy] error:', {
      requestId,
      elapsedMs: Date.now() - startedAt,
      error: err,
    })
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return NextResponse.json(
      {
        success: false,
        error: timedOut
          ? 'Study-plan chat took too long. Please retry once.'
          : 'Failed to reach study-plan service',
      },
      { status: timedOut ? 504 : 502 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
