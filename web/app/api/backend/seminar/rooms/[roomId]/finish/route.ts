import { NextRequest } from 'next/server'
import { backendHeaders } from '../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  try {
    const headers = backendHeaders(req)
    const res = await fetch(`${BACKEND_URL}/seminar/rooms/${params.roomId}/finish`, {
      method: 'POST',
      headers,
    })
    return await backendJsonResponse(res, 'seminar/finish proxy')
  } catch (err) {
    console.error('[seminar/finish proxy] error:', err)
    return proxyFailureResponse('Failed to finish seminar room')
  }
}
