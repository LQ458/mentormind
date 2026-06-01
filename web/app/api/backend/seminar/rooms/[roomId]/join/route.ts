import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  try {
    const body = await req.json().catch(() => ({}))
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const auth = req.headers.get('Authorization')
    if (auth) headers.Authorization = auth
    const res = await fetch(`${BACKEND_URL}/seminar/rooms/${params.roomId}/join`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[seminar/join proxy] error:', err)
    return NextResponse.json({ error: 'Failed to join seminar room' }, { status: 502 })
  }
}
