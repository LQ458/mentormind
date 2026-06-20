export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/users/me/diagnostic`, {
      method: 'POST',
      headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    return await backendJsonResponse(res, 'users/me diagnostic proxy')
  } catch (err) {
    console.error('[users/me diagnostic proxy] error:', err)
    return proxyFailureResponse('Failed to submit diagnostic')
  }
}
