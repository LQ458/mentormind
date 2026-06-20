import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../../_auth'
import { backendErrorResponse, backendJsonResponse, proxyFailureResponse } from '../../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
const AUDIO_TIMEOUT_MS = Number(process.env.SEMINAR_AUDIO_TIMEOUT_MS || 60000)

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AUDIO_TIMEOUT_MS)
  try {
    const body = await req.formData()
    const headers = backendHeaders(req)
    const res = await fetch(`${BACKEND_URL}/seminar/rooms/${params.roomId}/audio-turn`, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    return await backendJsonResponse(res, 'seminar/audio-turn proxy')
  } catch (err) {
    console.error('[seminar/audio-turn proxy] error:', err)
    const timedOut = err instanceof Error && err.name === 'AbortError'
    if (timedOut) {
      return backendErrorResponse('Seminar audio took too long. Try again.', 504, { code: 'timeout' })
    }
    return proxyFailureResponse('Failed to post audio turn')
  } finally {
    clearTimeout(timeout)
  }
}
