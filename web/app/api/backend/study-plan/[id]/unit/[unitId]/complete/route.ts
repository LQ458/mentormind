export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; unitId: string } }
) {
  try {
    const { id, unitId } = params;

    const backendResponse = await fetch(
      `${BACKEND_URL}/study-plan/${id}/unit/${unitId}/complete`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: request.headers.get('Authorization') || '',
        },
      }
    );

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    console.error('API proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to mark unit complete', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
