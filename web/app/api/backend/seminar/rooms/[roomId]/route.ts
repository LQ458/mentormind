import { NextRequest } from 'next/server'
import { backendHeaders } from '../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../_proxyErrors'

export const dynamic = 'force-dynamic'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function GET(
  req: NextRequest,
  { params }: { params: { roomId: string } },
) {
  try {
    const headers = backendHeaders(req)
    const res = await fetch(`${BACKEND_URL}/seminar/rooms/${params.roomId}`, {
      headers,
      cache: 'no-store',
    })
    return await backendJsonResponse(res, 'seminar/room proxy')
  } catch (err) {
    console.error('[seminar/room proxy] error:', err)
    return proxyFailureResponse('Failed to fetch seminar room')
  }
}
