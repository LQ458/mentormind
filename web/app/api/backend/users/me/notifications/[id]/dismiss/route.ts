export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { backendHeaders } from '../../../../../_auth'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = await fetch(`${BACKEND}/users/me/notifications/${params.id}/dismiss`, {
    method: 'POST',
    headers: backendHeaders(req),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
