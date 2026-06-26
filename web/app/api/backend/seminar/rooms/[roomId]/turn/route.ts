import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../../_auth'
import { backendErrorResponse, backendJsonResponse, proxyFailureResponse } from '../../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
const TURN_TIMEOUT_MS = Number(process.env.SEMINAR_TURN_TIMEOUT_MS || 45000)

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS)
  try {
    const roomId = encodeURIComponent(params.roomId)
    const body = await req.json()
    const headers = backendHeaders(req, { 'Content-Type': 'application/json' })
    const res = await fetch(`${BACKEND_URL}/seminar/rooms/${roomId}/turn`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    return await backendJsonResponse(res, 'seminar/turn proxy')
  } catch (err) {
    console.error('[seminar/turn proxy] error:', err)
    const timedOut = err instanceof Error && err.name === 'AbortError'
    if (timedOut) {
      return backendErrorResponse('Seminar AI took too long. Try again.', 504, { code: 'timeout' })
    }
    return proxyFailureResponse('Failed to post seminar turn')
  } finally {
    clearTimeout(timeout)
  }
}
