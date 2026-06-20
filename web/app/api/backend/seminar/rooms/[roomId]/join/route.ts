import { NextRequest } from 'next/server'
import { backendHeaders } from '../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  try {
    const body = await req.json().catch(() => ({}))
    const headers = backendHeaders(req, { 'Content-Type': 'application/json' })
    const res = await fetch(`${BACKEND_URL}/seminar/rooms/${params.roomId}/join`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    return await backendJsonResponse(res, 'seminar/join proxy')
  } catch (err) {
    console.error('[seminar/join proxy] error:', err)
    return proxyFailureResponse('Failed to join seminar room')
  }
}
