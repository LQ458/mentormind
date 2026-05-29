export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'

// SECURITY: This endpoint previously exposed server configuration details.
// It has been disabled to prevent information disclosure.
// If debug access is needed, it should require admin authentication and
// be restricted to non-production environments.

export async function GET() {
    return NextResponse.json(
        { error: 'This endpoint has been disabled for security reasons' },
        { status: 403 }
    )
}
