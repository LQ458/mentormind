export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { backendHeaders } from '../../_auth'
import { backendJsonResponse, proxyFailureResponse } from '../../_proxyErrors'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = encodeURIComponent(params.id);
    const headers = backendHeaders(request)

    const backendResponse = await fetch(`${BACKEND_URL}/study-plan/${id}`, { headers });
    return await backendJsonResponse(backendResponse, 'study-plan read proxy')
  } catch (error) {
    console.error('API proxy error:', error);
    return proxyFailureResponse('Failed to fetch study plan');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = encodeURIComponent(params.id);
    const headers = backendHeaders(request)

    const backendResponse = await fetch(`${BACKEND_URL}/study-plan/${id}`, {
      method: 'DELETE',
      headers,
    });
    return await backendJsonResponse(backendResponse, 'study-plan delete proxy')
  } catch (error) {
    console.error('API proxy error:', error);
    return proxyFailureResponse('Failed to delete study plan');
  }
}
