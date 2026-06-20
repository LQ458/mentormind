export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { backendHeaders } from '../../../../../_auth'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const res = await fetch(`${BACKEND}/users/me/lessons/${params.id}/seminar`, {
    method: 'POST',
    headers: backendHeaders(req, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
