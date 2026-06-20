export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { backendHeaders } from '../../../../_auth'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(req: NextRequest) {
  const res = await fetch(`${BACKEND}/users/me/notifications/sync`, {
    method: 'POST',
    headers: backendHeaders(req),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
