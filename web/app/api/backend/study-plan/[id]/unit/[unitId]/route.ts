import { NextRequest } from 'next/server'
import { backendHeaders } from '../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; unitId: string } },
) {
  try {
    const id = encodeURIComponent(params.id)
    const unitId = encodeURIComponent(params.unitId)
    const headers = backendHeaders(request)

    const backendResponse = await fetch(
      `${BACKEND_URL}/study-plan/${id}/unit/${unitId}`,
      { method: 'DELETE', headers },
    )
    return await backendJsonResponse(backendResponse, 'study-plan unit delete proxy')
  } catch (error) {
    console.error('[study-plan/unit delete proxy] error:', error)
    return proxyFailureResponse('Failed to delete study plan lesson')
  }
}
