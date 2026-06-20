import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendErrorResponse, logBackendProxyError, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
const CHAT_TIMEOUT_MS = Number(process.env.STUDY_PLAN_CHAT_TIMEOUT_MS || 75000)

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
      logBackendProxyError('study-plan/chat proxy', res.status, text)
      return {
        success: false,
        error: 'Study-plan service returned an invalid response',
        code: 'invalid_backend_response',
        status: res.status >= 400 ? res.status : 502,
      }
    }
  }
  logBackendProxyError('study-plan/chat proxy', res.status, text)
  return {
    success: false,
    error: res.status === 504 ? 'Study-plan service timed out' : 'Study-plan service returned an invalid response',
    code: res.status === 504 ? 'timeout' : 'invalid_backend_response',
    status: res.status >= 400 ? res.status : 502,
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
      headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
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
    const responseStatus =
      typeof data?.status === 'number' && data.status >= 400
        ? data.status
        : res.status
    return NextResponse.json(data, { status: responseStatus })
  } catch (err) {
    console.error('[study-plan/chat proxy] error:', {
      requestId,
      elapsedMs: Date.now() - startedAt,
      error: err,
    })
    const timedOut = err instanceof Error && err.name === 'AbortError'
    if (timedOut) {
      const response = backendErrorResponse(
        'Study-plan chat took too long. Please retry once.',
        504,
        { code: 'timeout' },
      )
      return response
    }
    return proxyFailureResponse('Failed to reach study-plan service')
  } finally {
    clearTimeout(timeout)
  }
}
