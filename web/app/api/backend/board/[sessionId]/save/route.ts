export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { backendHeaders } from '../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const sessionId = encodeURIComponent(params.sessionId)
    const body = await req.text()
    const headers = backendHeaders(req, { 'Content-Type': 'application/json' })
    const res = await fetch(`${BACKEND_URL}/board/${sessionId}/save`, {
      method: 'POST',
      headers,
      body,
    })
    return await backendJsonResponse(res, 'board save proxy')
  } catch (err) {
    console.error('[board save proxy] error:', err)
    return proxyFailureResponse('Failed to save board session')
  }
}
