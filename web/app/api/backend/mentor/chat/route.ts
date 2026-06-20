import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND_URL}/mentor/chat`, {
      method: 'POST',
      headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    return await backendJsonResponse(res, 'mentor/chat proxy')
  } catch (err) {
    console.error('[mentor/chat proxy] error:', err)
    return proxyFailureResponse('Failed to reach mentor service')
  }
}
