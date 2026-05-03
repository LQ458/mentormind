export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const language = url.searchParams.get('language');
  const target = `${BACKEND}/users/me/knowledge-graph${language ? `?language=${encodeURIComponent(language)}` : ''}`;
  const res = await fetch(target, {
    headers: { Authorization: req.headers.get('Authorization') || '' },
    cache: 'no-store',
  });
  const text = await res.text();
  try {
    return NextResponse.json(text ? JSON.parse(text) : { nodes: [], edges: [] }, { status: res.status });
  } catch {
    return NextResponse.json(
      { nodes: [], edges: [], error: 'Backend returned non-JSON', body: text.slice(0, 300) },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }
}
