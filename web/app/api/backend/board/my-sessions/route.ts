export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/board/my-sessions`, {
      method: 'GET',
      headers: backendHeaders(req),
    })
    return await backendJsonResponse(res, 'board my-sessions proxy')
  } catch (err) {
    console.error('[board my-sessions proxy] error:', err)
    return proxyFailureResponse('Failed to fetch board sessions')
  }
}
