import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const params = url.searchParams.toString()
    const res = await fetch(`${BACKEND_URL}/user/media-context${params ? '?' + params : ''}`, {
      headers: backendHeaders(req),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'Failed to reach backend' }, { status: 502 })
  }
}
