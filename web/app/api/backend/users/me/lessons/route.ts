export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  const res = await fetch(`${BACKEND}/users/me/lessons`, {
    headers: { Authorization: req.headers.get('Authorization') || '' },
    cache: 'no-store',
  });
  const text = await res.text();
  try {
    return NextResponse.json(text ? JSON.parse(text) : null, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: 'Backend returned non-JSON', status: res.status, body: text.slice(0, 500) },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }
}
