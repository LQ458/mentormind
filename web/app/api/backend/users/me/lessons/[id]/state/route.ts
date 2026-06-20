export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(`${BACKEND}/users/me/lessons/${params.id}/state`, {
      headers: backendHeaders(req),
    });
    return await backendJsonResponse(res, 'users/me lesson state proxy')
  } catch (err) {
    console.error('[users/me lesson state proxy] error:', err)
    return proxyFailureResponse('Failed to fetch lesson state')
  }
}
