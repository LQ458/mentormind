export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.toString();
    const res = await fetch(`${BACKEND}/users/me/notifications${search ? `?${search}` : ''}`, {
      headers: backendHeaders(req),
    });
    return await backendJsonResponse(res, 'users/me notifications proxy')
  } catch (err) {
    console.error('[users/me notifications proxy] error:', err)
    return proxyFailureResponse('Failed to fetch notifications')
  }
}
