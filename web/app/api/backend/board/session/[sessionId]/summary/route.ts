export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const sessionId = encodeURIComponent(params.sessionId)
    const body = await request.json().catch(() => ({}))
    const res = await fetch(
      `${BACKEND_URL}/board/session/${sessionId}/summary`,
      {
        method: 'POST',
        headers: backendHeaders(request, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(body),
      },
    )
    return await backendJsonResponse(res, 'board summary proxy')
  } catch (err) {
    console.error('[board summary proxy] error:', err)
    return proxyFailureResponse('Failed to request summary')
  }
}
