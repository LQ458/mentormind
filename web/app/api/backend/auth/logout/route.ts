export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('mm_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return noStore(response);
}
