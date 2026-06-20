export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/billing/create-checkout-session`, {
      method: 'POST',
      headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    return await backendJsonResponse(res, 'billing checkout proxy');
  } catch (err) {
    console.error('[billing checkout proxy] error:', err)
    return proxyFailureResponse('Failed to create checkout session')
  }
}
