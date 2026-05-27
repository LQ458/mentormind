export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${BACKEND}/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch (err) {
    const text = await res.text();
    data = { detail: text || 'Internal Server Error' };
  }

  if (data?.success && data?.token) {
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
}
