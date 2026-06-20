export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../_auth';
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND}/users/me`, {
      headers: backendHeaders(req),
    });
    return await backendJsonResponse(res, 'users/me read proxy');
  } catch (err) {
    console.error('[users/me proxy] error:', err);
    return proxyFailureResponse('Failed to fetch current user');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/users/me`, {
      method: 'PATCH',
      headers: {
        ...backendHeaders(req, { 'Content-Type': 'application/json' }),
      },
      body: JSON.stringify(body),
    });
    return await backendJsonResponse(res, 'users/me update proxy');
  } catch (err) {
    console.error('[users/me proxy] error:', err);
    return proxyFailureResponse('Failed to update current user');
  }
}
