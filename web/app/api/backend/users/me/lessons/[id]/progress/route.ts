export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/users/me/lessons/${params.id}/progress`, {
      method: 'POST',
      headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    return await backendJsonResponse(res, 'users/me lesson progress proxy')
  } catch (err) {
    console.error('[users/me lesson progress proxy] error:', err)
    return proxyFailureResponse('Failed to update lesson progress')
  }
}
