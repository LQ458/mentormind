import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../../_auth'

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
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[seminar/join proxy] error:', err)
    return NextResponse.json({ error: 'Failed to join seminar room' }, { status: 502 })
  }
}
