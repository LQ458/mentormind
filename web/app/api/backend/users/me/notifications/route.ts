export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { backendHeaders } from '../../../_auth'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.toString();
  const res = await fetch(`${BACKEND}/users/me/notifications${search ? `?${search}` : ''}`, {
    headers: backendHeaders(req),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
