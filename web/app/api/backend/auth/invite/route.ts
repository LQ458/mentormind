export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { backendErrorResponse, logBackendProxyError, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

async function readBackendJson(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    logBackendProxyError('auth/invite proxy', res.status, text)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${BACKEND}/auth/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await readBackendJson(res)
    if (!data) {
      const status = res.status >= 400 ? res.status : 502
      return backendErrorResponse('Auth service returned an invalid response', status, {
        code: 'invalid_backend_response',
        detail: 'The backend returned an invalid response.',
      })
    }

    if (data?.success && typeof data?.token === 'string' && data.token) {
      const response = NextResponse.json(data, { status: res.status });
      response.cookies.set('mm_token', data.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
      return response;
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[auth/invite proxy] error:', err)
    return proxyFailureResponse('Failed to authenticate')
  }
}
