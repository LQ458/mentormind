export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { backendHeaders } from '../../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; unitId: string } },
) {
  try {
    const id = encodeURIComponent(params.id)
    const unitId = encodeURIComponent(params.unitId)
    const body = await request.json().catch(() => ({}))
    const res = await fetch(
      `${BACKEND_URL}/study-plan/${id}/unit/${unitId}/board-lesson`,
      {
        method: 'POST',
        headers: backendHeaders(request, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      },
    )
    return await backendJsonResponse(res, 'study-plan board-lesson proxy')
  } catch (err) {
    console.error('[board-lesson proxy] error:', err)
    return proxyFailureResponse('Failed to start board lesson')
  }
}
