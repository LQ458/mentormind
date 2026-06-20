export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { backendHeaders } from '../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const { sessionId } = params
    const res = await fetch(`${BACKEND_URL}/board/${sessionId}/state`, {
      method: 'GET',
      cache: 'no-store',
      headers: backendHeaders(req),
    })
    const response = await backendJsonResponse(res, 'board state proxy')
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (err) {
    console.error('[board state proxy] error:', err)
    return proxyFailureResponse('Failed to fetch board state')
  }
}
