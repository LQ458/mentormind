import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND_URL}/study-plan/ask-ai`, {
      method: 'POST',
      headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    return await backendJsonResponse(res, 'study-plan/ask-ai proxy')
  } catch (err) {
    console.error('[study-plan/ask-ai proxy] error:', err)
    return proxyFailureResponse('Failed to reach ask-ai service')
  }
}
