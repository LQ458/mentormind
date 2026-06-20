export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../../../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../../../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; unitId: string } }
) {
  try {
    const id = encodeURIComponent(params.id);
    const unitId = encodeURIComponent(params.unitId);

    const backendResponse = await fetch(
      `${BACKEND_URL}/study-plan/${id}/unit/${unitId}/complete`,
      {
        method: 'POST',
        headers: backendHeaders(request, { 'Content-Type': 'application/json' }),
      }
    );

    return await backendJsonResponse(backendResponse, 'study-plan unit complete proxy')
  } catch (error) {
    console.error('API proxy error:', error);
    return proxyFailureResponse('Failed to mark unit complete');
  }
}
