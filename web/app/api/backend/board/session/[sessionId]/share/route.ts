import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const headers = backendHeaders(req)
    const res = await fetch(`${BACKEND_URL}/board/session/${params.sessionId}/share`, {
      method: 'POST',
      headers,
    })
    const data = await res.json()
    if (data?.token) {
      data.share_url = `${req.nextUrl.origin}/board-share/${params.sessionId}?token=${encodeURIComponent(data.token)}`
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[board share create proxy] error:', err)
    return NextResponse.json({ error: 'Failed to create share link' }, { status: 502 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const token = req.nextUrl.searchParams.get('token') || ''
    const res = await fetch(
      `${BACKEND_URL}/board/session/${params.sessionId}/share?token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[board share read proxy] error:', err)
    return NextResponse.json({ error: 'Failed to load share link' }, { status: 502 })
  }
}
