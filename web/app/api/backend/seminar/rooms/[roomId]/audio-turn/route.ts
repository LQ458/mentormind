import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../../_auth'

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
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[seminar/audio-turn proxy] error:', err)
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return NextResponse.json(
      { error: timedOut ? 'Seminar audio took too long. Try again.' : 'Failed to post audio turn' },
      { status: timedOut ? 504 : 502 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
