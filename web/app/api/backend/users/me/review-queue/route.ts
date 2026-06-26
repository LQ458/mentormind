export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND}/users/me/review-queue`, {
      headers: backendHeaders(req),
      cache: 'no-store',
    });
    return await backendJsonResponse(res, 'users/me review-queue proxy', { emptyBody: null })
  } catch (err) {
    console.error('[users/me review-queue proxy] error:', err)
    return proxyFailureResponse('Failed to fetch review queue')
  }
}
