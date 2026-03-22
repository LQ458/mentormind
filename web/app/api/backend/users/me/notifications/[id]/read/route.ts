export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = await fetch(`${BACKEND}/users/me/notifications/${params.id}/read`, {
    method: 'POST',
    headers: {
      Authorization: req.headers.get('Authorization') || '',
    },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
