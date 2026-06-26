export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return noStore(await backendJsonResponse(res, 'auth/register proxy'));
  } catch (err) {
    console.error('[auth/register proxy] error:', err)
    return noStore(proxyFailureResponse('Failed to register'))
  }
}
