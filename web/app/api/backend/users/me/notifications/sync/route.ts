export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND}/users/me/notifications/sync`, {
      method: 'POST',
      headers: backendHeaders(req),
    });
    return await backendJsonResponse(res, 'users/me notifications sync proxy')
  } catch (err) {
    console.error('[users/me notifications sync proxy] error:', err)
    return proxyFailureResponse('Failed to sync notifications')
  }
}
