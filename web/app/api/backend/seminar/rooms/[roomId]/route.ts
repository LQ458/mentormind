import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../_auth'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  try {
    const headers = backendHeaders(req)
    const res = await fetch(`${BACKEND_URL}/seminar/rooms/${params.roomId}`, {
      headers,
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[seminar/room proxy] error:', err)
    return NextResponse.json({ error: 'Failed to reach seminar room' }, { status: 502 })
  }
}
