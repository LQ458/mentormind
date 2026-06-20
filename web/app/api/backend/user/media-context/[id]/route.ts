import { NextRequest } from 'next/server'
import { backendHeaders } from '../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../_proxyErrors'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const res = await fetch(`${BACKEND_URL}/user/media-context/${id}`, {
      method: 'DELETE',
      headers: backendHeaders(req),
    })
    return await backendJsonResponse(res, 'user media-context delete proxy')
  } catch (err) {
    console.error('[user media-context delete proxy] error:', err)
    return proxyFailureResponse('Failed to delete media context')
  }
}
