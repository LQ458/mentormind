import { NextRequest } from 'next/server'
import { backendHeaders } from '../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const headers = backendHeaders(req, { 'Content-Type': 'application/json' })
    const res = await fetch(`${BACKEND_URL}/quick-question`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    return await backendJsonResponse(res, 'quick-question proxy')
  } catch (err) {
    console.error('[quick-question proxy] error:', err)
    return proxyFailureResponse('Failed to answer quick question')
  }
}
