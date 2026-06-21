export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = encodeURIComponent(params.id)
    const res = await fetch(`${BACKEND}/users/me/notifications/${id}/read`, {
      method: 'POST',
      headers: backendHeaders(req),
    });
    return await backendJsonResponse(res, 'users/me notification read proxy')
  } catch (err) {
    console.error('[users/me notification read proxy] error:', err)
    return proxyFailureResponse('Failed to mark notification read')
  }
}
