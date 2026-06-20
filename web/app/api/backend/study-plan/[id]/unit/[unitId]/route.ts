import { NextRequest, NextResponse } from 'next/server'
import { backendHeaders } from '../../../../_auth'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; unitId: string } },
) {
  try {
    const headers = backendHeaders(request)

    const backendResponse = await fetch(
      `${BACKEND_URL}/study-plan/${params.id}/unit/${params.unitId}`,
      { method: 'DELETE', headers },
    )
    const data = await backendResponse.json()
    return NextResponse.json(data, { status: backendResponse.status })
  } catch (error) {
    console.error('[study-plan/unit delete proxy] error:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete study plan lesson',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
