import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const params = url.searchParams.toString()
    const res = await fetch(`${BACKEND_URL}/user/media-context${params ? '?' + params : ''}`, {
      headers: { Authorization: req.headers.get('Authorization') || '' },
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Failed to reach backend' }, { status: 502 })
  }
}
