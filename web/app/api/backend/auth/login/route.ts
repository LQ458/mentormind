export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await backendJsonResponse(res, 'auth/login proxy');
  } catch (err) {
    console.error('[auth/login proxy] error:', err)
    return proxyFailureResponse('Failed to login')
  }
}
