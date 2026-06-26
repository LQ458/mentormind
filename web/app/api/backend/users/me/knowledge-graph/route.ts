export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../_proxyErrors'

const BACKEND = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const language = url.searchParams.get('language');
    const target = `${BACKEND}/users/me/knowledge-graph${language ? `?language=${encodeURIComponent(language)}` : ''}`;
    const res = await fetch(target, {
      headers: backendHeaders(req),
      cache: 'no-store',
    });
    return await backendJsonResponse(res, 'users/me knowledge-graph proxy', {
      emptyBody: { nodes: [], edges: [] },
    })
  } catch (err) {
    console.error('[users/me knowledge-graph proxy] error:', err)
    return proxyFailureResponse('Failed to fetch knowledge graph')
  }
}
