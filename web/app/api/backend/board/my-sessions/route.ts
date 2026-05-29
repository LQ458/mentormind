export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/board/my-sessions`, {
      method: 'GET',
      headers: {
        Authorization: req.headers.get('Authorization') || '',
      },
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[board my-sessions proxy] error:', err)
    return NextResponse.json(
      { error: 'Failed to reach board service' },
      { status: 502 },
    )
  }
}
