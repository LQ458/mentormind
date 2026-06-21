export const dynamic = 'force-dynamic'
import { NextRequest } from 'next/server'
import { backendHeaders } from '../../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { eventId: string } },
) {
  try {
    const eventId = encodeURIComponent(params.eventId)
    const body = await req.text()
    const res = await fetch(`${BACKEND_URL}/admin/feedback/reports/${eventId}/triage`, {
      method: 'PATCH',
      headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
      body,
    })
    return await backendJsonResponse(res, 'admin feedback report triage proxy', { sanitizeErrors: true })
  } catch (err) {
    console.error('[admin feedback report triage proxy] error:', err)
    return proxyFailureResponse('Failed to update feedback report triage')
  }
}
