export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND}/users/me/profile`, {
      headers: backendHeaders(req),
    });
    return await backendJsonResponse(res, 'users/me profile proxy')
  } catch (err) {
    console.error('[users/me profile proxy] error:', err)
    return proxyFailureResponse('Failed to fetch user profile')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/users/me/profile`, {
      method: 'PUT',
      headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    return await backendJsonResponse(res, 'users/me profile update proxy')
  } catch (err) {
    console.error('[users/me profile update proxy] error:', err)
    return proxyFailureResponse('Failed to update user profile')
  }
}
