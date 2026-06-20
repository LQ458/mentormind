import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../_auth'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

function authHeaders(req: NextRequest, json = false): Record<string, string> {
  const headers = backendHeaders(req)
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND_URL}/seminar/rooms`, {
      headers: authHeaders(req),
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[seminar/rooms proxy] error:', err)
    return NextResponse.json({ error: 'Failed to reach seminar service' }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const res = await fetch(`${BACKEND_URL}/seminar/rooms`, {
      method: 'POST',
      headers: authHeaders(req, true),
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error('[seminar/rooms proxy] create error:', err)
    return NextResponse.json({ error: 'Failed to create seminar room' }, { status: 502 })
  }
}
