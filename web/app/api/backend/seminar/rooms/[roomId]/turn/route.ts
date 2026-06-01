import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'
const TURN_TIMEOUT_MS = Number(process.env.SEMINAR_TURN_TIMEOUT_MS || 45000)

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS)
  try {
    const body = await req.json()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const auth = req.headers.get('Authorization')
    if (auth) headers.Authorization = auth
    const res = await fetch(`${BACKEND_URL}/seminar/rooms/${params.roomId}/turn`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[seminar/turn proxy] error:', err)
    const timedOut = err instanceof Error && err.name === 'AbortError'
    return NextResponse.json(
      { error: timedOut ? 'Seminar AI took too long. Try again.' : 'Failed to post seminar turn' },
      { status: timedOut ? 504 : 502 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
