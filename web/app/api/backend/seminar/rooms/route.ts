import { NextRequest } from 'next/server'
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

function authHeaders(req: NextRequest, json = false): Record<string, string> {
  const headers = backendHeaders(req)
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/seminar/rooms`, {
      headers: authHeaders(req),
      cache: 'no-store',
    })
    return await backendJsonResponse(res, 'seminar/rooms list proxy')
  } catch (err) {
    console.error('[seminar/rooms proxy] error:', err)
    return proxyFailureResponse('Failed to fetch seminar rooms')
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND_URL}/seminar/rooms`, {
      method: 'POST',
      headers: authHeaders(req, true),
      body: JSON.stringify(body),
    })
    return await backendJsonResponse(res, 'seminar/rooms create proxy')
  } catch (err) {
    console.error('[seminar/rooms proxy] create error:', err)
    return proxyFailureResponse('Failed to create seminar room')
  }
}
