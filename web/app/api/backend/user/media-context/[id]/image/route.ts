import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const res = await fetch(`${BACKEND_URL}/user/media-context/${id}/image`, {
      headers: { Authorization: req.headers.get('Authorization') || '' },
    })
    if (!res.ok) {
      return NextResponse.json({ error: 'Image not found' }, { status: res.status })
    }
    const blob = await res.blob()
    return new NextResponse(blob, {
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'image/png' },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to reach backend' }, { status: 502 })
  }
}
