export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const headers = backendHeaders(req, { 'Content-Type': 'application/json' })
    const res = await fetch(`${BACKEND_URL}/feedback/submit`, {
      method: 'POST',
      headers,
      body,
    })
    return await backendJsonResponse(res, 'feedback submit proxy')
  } catch (err) {
    console.error('[feedback submit proxy] error:', err)
    return proxyFailureResponse('Failed to submit feedback')
  }
}
