import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../../_auth'
import { backendErrorResponse, backendJsonResponse, logBackendProxyError, proxyFailureResponse } from '../../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

async function readBackendJson(res: Response, scope: string): Promise<Record<string, unknown> | null> {
  const text = await res.text()
  if (!text) return {}
  try {
    const data = JSON.parse(text)
    return data && typeof data === 'object' ? data : {}
  } catch {
    logBackendProxyError(scope, res.status, text)
    return null
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const headers = backendHeaders(req)
    const res = await fetch(`${BACKEND_URL}/board/session/${params.sessionId}/share`, {
      method: 'POST',
      headers,
    })
    const data = await readBackendJson(res, 'board share create proxy')
    if (!data) {
      const status = res.status >= 400 ? res.status : 502
      return backendErrorResponse('Backend returned an invalid response', status, {
        code: 'invalid_backend_response',
        detail: 'The backend returned an invalid response.',
      })
    }
    if (typeof data.token === 'string' && data.token) {
      data.share_url = `${req.nextUrl.origin}/board-share/${params.sessionId}?token=${encodeURIComponent(data.token)}`
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[board share create proxy] error:', err)
    return proxyFailureResponse('Failed to create share link')
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const token = req.nextUrl.searchParams.get('token') || ''
    const res = await fetch(
      `${BACKEND_URL}/board/session/${params.sessionId}/share?token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    )
    return await backendJsonResponse(res, 'board share read proxy')
  } catch (err) {
    console.error('[board share read proxy] error:', err)
    return proxyFailureResponse('Failed to load share link')
  }
}
