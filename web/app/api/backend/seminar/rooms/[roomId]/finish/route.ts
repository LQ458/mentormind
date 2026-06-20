import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  try {
    const headers = backendHeaders(req)
    const res = await fetch(`${BACKEND_URL}/seminar/rooms/${params.roomId}/finish`, {
      method: 'POST',
      headers,
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[seminar/finish proxy] error:', err)
    return NextResponse.json({ error: 'Failed to finish seminar room' }, { status: 502 })
  }
}
